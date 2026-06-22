//! ctracking — local-only macOS activity tracker.
//! Module layout per docs/01-architecture.md.

mod analytics;
mod commands;
mod obs;
mod platform;
mod server;
mod settings;
mod storage;
mod sync;
mod tray;
mod trackers;

use std::sync::Arc;
use tauri::Manager;

/// Current unix time in seconds. Shared helper for sync bookkeeping.
pub fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Apply the "run without an app-launcher presence" setting. macOS toggles the
/// Dock icon via the activation policy; Windows hides the taskbar button (the app
/// stays reachable from the tray). No-op elsewhere.
#[cfg(target_os = "macos")]
fn apply_dock_policy(app: &tauri::AppHandle, hide: bool) {
    let _ = app.set_activation_policy(if hide {
        tauri::ActivationPolicy::Accessory
    } else {
        tauri::ActivationPolicy::Regular
    });
}
#[cfg(target_os = "windows")]
fn apply_dock_policy(app: &tauri::AppHandle, hide: bool) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.set_skip_taskbar(hide);
    }
}
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn apply_dock_policy(_app: &tauri::AppHandle, _hide: bool) {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Sentry error reporting for the Rust core. Held for the whole process (drop =
    // flush); no-op when CTRACKING_SENTRY_DSN is unset. Installs the panic hook too.
    let _sentry = obs::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // Auto-update: check a signed manifest on our own domain, download + install.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::track_event,

            commands::set_paused,
            commands::is_paused,
            commands::tracking_state,
            commands::dashboard_data,
            commands::keystroke_buckets,
            commands::screenshot_list,
            commands::browser_visits,
            commands::get_settings,
            commands::set_settings,
            commands::set_locale,
            commands::export_csv,
            commands::export_json,
            commands::permissions_status,
            commands::open_permission_settings,
            commands::request_screen_recording,
            commands::request_input_monitoring,
            commands::request_accessibility,
            commands::capture_now,
            commands::browser_link,
            commands::list_businesses,
            commands::signup_url,
            commands::login,
            commands::logout,
            commands::current_session,
            commands::sync_status,
            commands::apply_org_policy,
            commands::capture_policy,
        ])
        .setup(|app| {
            // Open the local SQLite DB under the app data dir.
            let data_dir = app.path().app_data_dir().expect("resolve app data dir");
            std::fs::create_dir_all(&data_dir).expect("create app data dir");
            let db_path = data_dir.join("data.db");
            let db = Arc::new(storage::Db::open(&db_path).expect("open database"));

            // Shared control surface for the trackers (pause, intervals, privacy).
            let control = Arc::new(trackers::TrackerControl::new());

            // Load persisted settings and apply them to the live control.
            let settings_path = data_dir.join("settings.json");
            let loaded = settings::load_with_device_id(&settings_path);
            settings::apply(&loaded, &control);
            let hide_dock = loaded.hide_dock;
            let loaded_locale = loaded.locale.clone();
            let device_id = loaded.device_id.clone();
            let settings_state = Arc::new(settings::SettingsState {
                path: settings_path,
                current: std::sync::Mutex::new(loaded),
                managed: std::sync::Mutex::new(settings::CaptureManaged::default()),
            });
            app.manage(settings_state.clone());
            // Manage control early so the tray can read pause state.
            app.manage(control.clone());

            // Menu bar item (Start/Stop/Open) + Dock visibility per settings.
            tray::build(&app.handle(), control.clone())?;
            apply_dock_policy(&app.handle(), hide_dock);

            // Keep running when the window is closed — hide to the menu bar instead.
            if let Some(win) = app.get_webview_window("main") {
                let w = win.clone();
                win.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = w.hide();
                    }
                });
            }

            // Register with macOS TCC up front so the app appears in the Accessibility
            // and Input Monitoring lists and the user gets the prompts. No-ops once
            // granted. (Screen Recording is requested from the Permissions screen.)
            platform::request_accessibility();
            platform::request_input_monitoring();

            // Start the trackers, keyboard counter, screenshots, retention cleanup.
            let shots_dir = data_dir.join("screenshots");
            trackers::start(db.clone(), control.clone());
            trackers::start_keyboard(db.clone(), control.clone());
            trackers::start_screenshots(db.clone(), control.clone(), shots_dir);
            trackers::start_cleanup(db.clone(), control.clone());

            // Start the local ingest server for the browser extension.
            let link = server::start(db.clone(), control.clone());
            app.manage(link);

            // Auth/session (task 51): load any persisted session from disk.
            let auth = Arc::new(sync::AuthState::load(data_dir.join("session.json")));
            app.manage(auth.clone());

            // Sync worker (task 53): pushes pending rows to the backend in the
            // background. No-op while logged out / offline.
            let status = Arc::new(sync::worker::SyncStatus::default());
            app.manage(status.clone());
            sync::worker::start(sync::worker::SyncContext {
                db: db.clone(),
                auth,
                status,
                settings: settings_state,
            });

            // Manage remaining state so commands can reach the DB.
            app.manage(db);

            // Product analytics: one fire-and-forget event per launch (crash-free,
            // direct Aptabase API — see analytics.rs). Keyed by the stable device_id for
            // unique-device DAU; offline launches queue under data_dir for later flush.
            analytics::track_app_started(loaded_locale, device_id, data_dir.join("analytics-queue"));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
