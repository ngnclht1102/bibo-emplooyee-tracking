//! Menu bar (status bar) item: shows tracking state and offers Start / Stop /
//! Open main UI / Quit. Also the single place pause state is changed, so the tray,
//! the dashboard pill, and the trackers stay in sync.
//!
//! Indicator (glanceable, updated every couple seconds):
//!   🟢 tracking   🟡 idle (present, not counting active time)   🔴 paused

use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};

use crate::settings::SettingsState;
use crate::trackers::TrackerControl;

const TRAY_ID: &str = "main";

/// Handles to the menu items, so we can enable/disable (start/stop) and relabel
/// them (on a language change). Managed in Tauri state.
struct MenuItems {
    open: MenuItem<tauri::Wry>,
    start: MenuItem<tauri::Wry>,
    stop: MenuItem<tauri::Wry>,
    quit: MenuItem<tauri::Wry>,
}

/// The active UI locale persisted in settings (defaults to "en" if unavailable).
fn current_locale(app: &AppHandle) -> String {
    app.try_state::<Arc<SettingsState>>()
        .map(|s| s.current.lock().unwrap().locale.clone())
        .unwrap_or_else(|| "en".into())
}

/// Localized native (tray) strings. Brand name stays verbatim. Falls back to
/// English for any unknown locale.
fn tr(locale: &str, key: &str) -> String {
    let s = |en: &str, zh: &str, ja: &str, vi: &str, id: &str, fr: &str, es: &str| -> String {
        match locale {
            "zh" => zh,
            "ja" => ja,
            "vi" => vi,
            "id" => id,
            "fr" => fr,
            "es" => es,
            _ => en,
        }
        .to_string()
    };
    match key {
        "open" => s("Open main UI", "打开主界面", "メイン画面を開く", "Mở giao diện chính", "Buka antarmuka utama", "Ouvrir l'interface", "Abrir la interfaz"),
        "start" => s("Start", "开始", "開始", "Bắt đầu", "Mulai", "Démarrer", "Iniciar"),
        "stop" => s("Stop", "停止", "停止", "Dừng", "Hentikan", "Arrêter", "Detener"),
        "quit" => s("Quit BiBoTracking", "退出 BiBoTracking", "BiBoTracking を終了", "Thoát BiBoTracking", "Keluar dari BiBoTracking", "Quitter BiBoTracking", "Salir de BiBoTracking"),
        "tip_tracking" => s("tracking", "正在跟踪", "トラッキング中", "đang theo dõi", "melacak", "suivi en cours", "en seguimiento"),
        "tip_idle" => s("idle (not counting)", "空闲（未计数）", "アイドル（カウントなし）", "không hoạt động (không tính)", "diam (tidak menghitung)", "inactif (pas de comptage)", "inactivo (sin contar)"),
        "tip_paused" => s("paused", "已暂停", "一時停止中", "đã tạm dừng", "dijeda", "en pause", "en pausa"),
        _ => key.to_string(),
    }
}

#[derive(Clone, Copy, PartialEq)]
enum State {
    Tracking,
    Idle,
    Paused,
}

impl State {
    fn code(self) -> u8 {
        match self {
            State::Tracking => 0,
            State::Idle => 1,
            State::Paused => 2,
        }
    }
    fn label(self) -> &'static str {
        match self {
            State::Tracking => "tracking",
            State::Idle => "idle",
            State::Paused => "paused",
        }
    }
}

/// Last broadcast state code, so we only emit on change. 255 = "unset".
static LAST_STATE: AtomicU8 = AtomicU8::new(255);

// State-colored menu-bar glyphs (not template images, so the tint shows).
const ICON_TRACKING: &[u8] = include_bytes!("../../icons/tray/tray-tracking.png");
const ICON_IDLE: &[u8] = include_bytes!("../../icons/tray/tray-idle.png");
const ICON_PAUSED: &[u8] = include_bytes!("../../icons/tray/tray-paused.png");

fn icon_for(state: State) -> tauri::image::Image<'static> {
    let bytes = match state {
        State::Tracking => ICON_TRACKING,
        State::Idle => ICON_IDLE,
        State::Paused => ICON_PAUSED,
    };
    tauri::image::Image::from_bytes(bytes).expect("decode tray icon")
}

/// Build the tray icon + menu and start the status updater. Call once during setup.
pub fn build(app: &AppHandle, control: Arc<TrackerControl>) -> tauri::Result<()> {
    let loc = current_locale(app);
    let open = MenuItem::with_id(app, "open", tr(&loc, "open"), true, None::<&str>)?;
    let start = MenuItem::with_id(app, "start", tr(&loc, "start"), true, None::<&str>)?;
    let stop = MenuItem::with_id(app, "stop", tr(&loc, "stop"), true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", tr(&loc, "quit"), true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &open,
            &PredefinedMenuItem::separator(app)?,
            &start,
            &stop,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon_for(State::Tracking))
        .icon_as_template(false) // keep our state tint colors
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "start" => set_paused(app, false),
            "stop" => set_paused(app, true),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    // Keep handles so refresh() can enable/disable Start vs Stop, and relabel() can
    // re-translate all items when the language changes.
    app.manage(MenuItems { open, start, stop, quit });

    refresh(app);
    start_status_updater(app.clone(), control);
    Ok(())
}

/// Show + focus the main window (it may be hidden in menu-bar-only mode).
pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// The single source of truth for changing pause state: updates the trackers, the
/// tray indicator, and notifies the UI via an event.
pub fn set_paused(app: &AppHandle, paused: bool) {
    if let Some(c) = app.try_state::<Arc<TrackerControl>>() {
        c.paused.store(paused, Ordering::Relaxed);
    }
    refresh(app); // emits the new tracking-state + updates the badge
}

/// Recompute the current state and update the tray (dispatched to the main thread,
/// since AppKit status-item updates must happen there).
pub fn refresh(app: &AppHandle) {
    let (paused, threshold) = match app.try_state::<Arc<TrackerControl>>() {
        Some(c) => (
            c.paused.load(Ordering::Relaxed),
            c.idle_threshold_s.load(Ordering::Relaxed) as f64,
        ),
        None => (false, 60.0),
    };
    let state = if paused {
        State::Paused
    } else if crate::platform::idle_seconds() >= threshold {
        State::Idle
    } else {
        State::Tracking
    };

    // Broadcast to the UI only when the state actually changes.
    if LAST_STATE.swap(state.code(), Ordering::Relaxed) != state.code() {
        let _ = app.emit("tracking-state", state.label());
    }

    let app2 = app.clone();
    let _ = app.run_on_main_thread(move || render(&app2, state));
}

fn render(app: &AppHandle, state: State) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let loc = current_locale(app);
        let word = match state {
            State::Tracking => tr(&loc, "tip_tracking"),
            State::Idle => tr(&loc, "tip_idle"),
            State::Paused => tr(&loc, "tip_paused"),
        };
        let tip = format!("BiBoTracking — {word}");
        // The glyph's tint conveys the state — no separate dot/badge needed.
        let _ = tray.set_icon(Some(icon_for(state)));
        let _ = tray.set_tooltip(Some(tip));
    }

    // Start is available only when paused; Stop only when running (tracking/idle).
    let paused = state == State::Paused;
    if let Some(items) = app.try_state::<MenuItems>() {
        let _ = items.start.set_enabled(paused);
        let _ = items.stop.set_enabled(!paused);
    }
}

/// Re-translate the tray menu items + tooltip to the current locale. Call after a
/// language change.
pub fn relabel(app: &AppHandle) {
    let loc = current_locale(app);
    if let Some(items) = app.try_state::<MenuItems>() {
        let _ = items.open.set_text(tr(&loc, "open"));
        let _ = items.start.set_text(tr(&loc, "start"));
        let _ = items.stop.set_text(tr(&loc, "stop"));
        let _ = items.quit.set_text(tr(&loc, "quit"));
    }
    refresh(app); // re-renders the localized tooltip
}

fn start_status_updater(app: AppHandle, _control: Arc<TrackerControl>) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(2));
        refresh(&app);
    });
}
