//! Menu bar (status bar) item: shows tracking state and offers Start / Stop /
//! Open main UI / Quit. Also the single place pause state is changed, so the tray,
//! the dashboard pill, and the trackers stay in sync.
//!
//! Indicator (glanceable, updated every couple seconds):
//!   🟢 tracking   🟡 idle (present, not counting active time)   🔴 paused
//!
//! It also drives the billing task timer (CTR-16): the UI pushes the open tasks
//! assigned to the signed-in member here, so a task can be picked and stopped from
//! the menu bar without opening the window, and the elapsed time shows next to the
//! icon. The timer itself stays in the UI (it owns active-time accounting and the
//! offline upload queue) — the tray only emits `tray-task` events.

use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};

use crate::settings::SettingsState;
use crate::trackers::TrackerControl;

const TRAY_ID: &str = "main";

/// Handles to the tracking Start/Stop items, so render() can enable/disable them.
/// Replaced whenever the menu is rebuilt (task list, timer, language change).
struct MenuItems {
    start: MenuItem<tauri::Wry>,
    stop: MenuItem<tauri::Wry>,
}

/// One quick-pick task in the menu bar, as pushed by the UI.
#[derive(Clone, Serialize, Deserialize)]
pub struct TrayTask {
    pub id: String,
    pub title: String,
    pub project: String,
}

/// The timer the UI currently has running (`started_at` = unix seconds), so the
/// menu bar can show the elapsed time.
#[derive(Clone, Serialize, Deserialize)]
pub struct TrayTimer {
    pub task_id: String,
    pub title: String,
    pub started_at: i64,
}

/// Tray state: the live menu handles plus what the UI last told us about tasks.
struct TrayMenu {
    items: Mutex<MenuItems>,
    tasks: Mutex<Vec<TrayTask>>,
    timer: Mutex<Option<TrayTimer>>,
}

/// At most this many tasks in the quick-pick submenu (the menu stays glanceable).
const MAX_TASKS: usize = 10;

/// True while the user is on the welcome/login/onboarding surfaces (not the
/// dashboard). Start stays disabled there — tracking is resumed by finishing
/// setup, not from the tray. Defaults to true until the UI reports otherwise.
static IN_SETUP: AtomicBool = AtomicBool::new(true);

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
        "version" => s("Version", "版本", "バージョン", "Phiên bản", "Versi", "Version", "Versión"),
        "quit" => s("Quit BiBoTracking", "退出 BiBoTracking", "BiBoTracking を終了", "Thoát BiBoTracking", "Keluar dari BiBoTracking", "Quitter BiBoTracking", "Salir de BiBoTracking"),
        "tip_tracking" => s("tracking", "正在跟踪", "トラッキング中", "đang theo dõi", "melacak", "suivi en cours", "en seguimiento"),
        "tip_idle" => s("idle (not counting)", "空闲（未计数）", "アイドル（カウントなし）", "không hoạt động (không tính)", "diam (tidak menghitung)", "inactif (pas de comptage)", "inactivo (sin contar)"),
        "tip_paused" => s("paused", "已暂停", "一時停止中", "đã tạm dừng", "dijeda", "en pause", "en pausa"),
        "startTask" => s("Start a task", "开始任务", "タスクを開始", "Bắt đầu một việc", "Mulai tugas", "Démarrer une tâche", "Iniciar una tarea"),
        "stopTimer" => s("Stop timer", "停止计时", "タイマーを停止", "Dừng bộ đếm", "Hentikan timer", "Arrêter le minuteur", "Detener el temporizador"),
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

/// Shorten a task title so the menu bar stays narrow.
fn short(s: &str) -> String {
    if s.chars().count() <= 38 {
        return s.to_string();
    }
    format!("{}…", s.chars().take(37).collect::<String>())
}

/// Build the whole tray menu for the current state. Fixed items (Open, Start/Stop,
/// Version, Quit) plus the task section: the running timer's Stop, or a quick-pick
/// submenu of the member's open tasks. Returns the handles for the fixed items.
fn build_menu(
    app: &AppHandle,
    tasks: &[TrayTask],
    timer: Option<&TrayTimer>,
) -> tauri::Result<(Menu<tauri::Wry>, MenuItems)> {
    let loc = current_locale(app);
    let open = MenuItem::with_id(app, "open", tr(&loc, "open"), true, None::<&str>)?;
    // Start resumes tracking, but only from the dashboard (disabled during
    // welcome/login/onboarding — see IN_SETUP). BRI-22
    let start = MenuItem::with_id(app, "start", tr(&loc, "start"), false, None::<&str>)?;
    let stop = MenuItem::with_id(app, "stop", tr(&loc, "stop"), true, None::<&str>)?;
    let version = MenuItem::with_id(app, "version", version_label(app, &loc), false, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", tr(&loc, "quit"), true, None::<&str>)?;

    let menu = Menu::new(app)?;
    menu.append(&open)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;

    // Task timer. Absent entirely until the UI pushes a task list (personal use,
    // signed out, or a family workspace never gets one).
    if let Some(t) = timer {
        let label = format!("{} · {}", tr(&loc, "stopTimer"), short(&t.title));
        menu.append(&MenuItem::with_id(app, "timer:stop", label, true, None::<&str>)?)?;
        menu.append(&PredefinedMenuItem::separator(app)?)?;
    } else if !tasks.is_empty() {
        let mut items: Vec<MenuItem<tauri::Wry>> = Vec::new();
        for task in tasks.iter().take(MAX_TASKS) {
            let label = if task.project.is_empty() {
                short(&task.title)
            } else {
                format!("{} · {}", task.project, short(&task.title))
            };
            items.push(MenuItem::with_id(app, format!("timer:start:{}", task.id), label, true, None::<&str>)?);
        }
        let refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> =
            items.iter().map(|i| i as &dyn tauri::menu::IsMenuItem<tauri::Wry>).collect();
        menu.append(&Submenu::with_items(app, tr(&loc, "startTask"), true, &refs)?)?;
        menu.append(&PredefinedMenuItem::separator(app)?)?;
    }

    menu.append(&start)?;
    menu.append(&stop)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&version)?;
    menu.append(&quit)?;
    Ok((menu, MenuItems { start, stop }))
}

/// Build the tray icon + menu and start the status updater. Call once during setup.
pub fn build(app: &AppHandle, control: Arc<TrackerControl>) -> tauri::Result<()> {
    let (menu, items) = build_menu(app, &[], None)?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon_for(State::Tracking))
        .icon_as_template(false) // keep our state tint colors
        .menu(&menu)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            match id {
                "open" => show_main(app),
                "start" => set_paused(app, false),
                "stop" => set_paused(app, true),
                "quit" => app.exit(0),
                // The timer lives in the UI; the tray only asks for it to start/stop.
                "timer:stop" => {
                    let _ = app.emit("tray-task", serde_json::json!({ "action": "stop" }));
                }
                _ => {
                    if let Some(task_id) = id.strip_prefix("timer:start:") {
                        let _ = app.emit(
                            "tray-task",
                            serde_json::json!({ "action": "start", "task_id": task_id }),
                        );
                    }
                }
            }
        })
        .build(app)?;

    // Keep the handles so render() can enable/disable Start vs Stop; replaced every
    // time the menu is rebuilt (task list, running timer, language change).
    app.manage(TrayMenu {
        items: Mutex::new(items),
        tasks: Mutex::new(Vec::new()),
        timer: Mutex::new(None),
    });

    refresh(app);
    start_status_updater(app.clone(), control);
    Ok(())
}

/// Replace the quick-pick tasks and the running timer (pushed by the UI whenever
/// either changes), then rebuild the menu.
pub fn set_tasks(app: &AppHandle, tasks: Vec<TrayTask>, timer: Option<TrayTimer>) {
    let Some(state) = app.try_state::<TrayMenu>() else {
        return;
    };
    *state.tasks.lock().unwrap() = tasks;
    *state.timer.lock().unwrap() = timer;
    let app2 = app.clone();
    let _ = app.run_on_main_thread(move || rebuild(&app2));
}

/// Rebuild the menu from the current state. Main thread only (AppKit).
fn rebuild(app: &AppHandle) {
    let Some(state) = app.try_state::<TrayMenu>() else {
        return;
    };
    let tasks = state.tasks.lock().unwrap().clone();
    let timer = state.timer.lock().unwrap().clone();
    if let (Ok((menu, items)), Some(tray)) = (build_menu(app, &tasks, timer.as_ref()), app.tray_by_id(TRAY_ID)) {
        if tray.set_menu(Some(menu)).is_ok() {
            *state.items.lock().unwrap() = items;
        }
    }
    refresh(app);
}

/// "Version 1.4.1" — localized word + the app version from tauri.conf.json.
fn version_label(app: &AppHandle, loc: &str) -> String {
    format!("{} {}", tr(loc, "version"), app.package_info().version)
}

/// Record whether the user is still in setup (welcome/login/onboarding) and pause
/// tracking accordingly; on the dashboard tracking resumes and Start becomes usable.
pub fn set_in_setup(app: &AppHandle, in_setup: bool) {
    IN_SETUP.store(in_setup, Ordering::Relaxed);
    set_paused(app, in_setup);
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

/// Elapsed timer time, compact enough for the menu bar: "7m", "1h07".
fn elapsed(started_at: i64) -> String {
    let secs = (crate::now_unix() - started_at).max(0);
    let (h, m) = (secs / 3600, (secs % 3600) / 60);
    if h > 0 {
        format!("{h}h{m:02}")
    } else {
        format!("{m}m")
    }
}

fn render(app: &AppHandle, state: State) {
    let timer = app
        .try_state::<TrayMenu>()
        .and_then(|s| s.timer.lock().unwrap().clone());
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let loc = current_locale(app);
        let word = match state {
            State::Tracking => tr(&loc, "tip_tracking"),
            State::Idle => tr(&loc, "tip_idle"),
            State::Paused => tr(&loc, "tip_paused"),
        };
        let tip = match &timer {
            Some(t) => format!("BiBoTracking — {} · {} — {word}", short(&t.title), elapsed(t.started_at)),
            None => format!("BiBoTracking — {word}"),
        };
        // The glyph's tint conveys the state — no separate dot/badge needed. The
        // running task's elapsed time sits next to it (macOS menu bar only).
        let _ = tray.set_icon(Some(icon_for(state)));
        let _ = tray.set_tooltip(Some(tip));
        let _ = tray.set_title(timer.as_ref().map(|t| elapsed(t.started_at)));
    }

    // Stop is available only while running (tracking/idle); Start only while
    // paused AND on the dashboard (never from the setup surfaces).
    let paused = state == State::Paused;
    if let Some(st) = app.try_state::<TrayMenu>() {
        let items = st.items.lock().unwrap();
        let _ = items.start.set_enabled(paused && !IN_SETUP.load(Ordering::Relaxed));
        let _ = items.stop.set_enabled(!paused);
    }
}

/// Re-translate the tray menu + tooltip to the current locale. Call after a
/// language change. Rebuilds, so the task section is translated too.
pub fn relabel(app: &AppHandle) {
    let app2 = app.clone();
    let _ = app.run_on_main_thread(move || rebuild(&app2));
}

fn start_status_updater(app: AppHandle, _control: Arc<TrackerControl>) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(2));
        refresh(&app);
    });
}
