//! ctracking — local-only macOS activity tracker.
//! Module layout per docs/01-architecture.md.

mod commands;
mod platform;
mod server;
mod settings;
mod storage;
mod tray;
mod trackers;

use std::sync::Arc;
use tauri::Manager;

#[cfg(target_os = "macos")]
fn apply_dock_policy(app: &tauri::AppHandle, hide: bool) {
    let _ = app.set_activation_policy(if hide {
        tauri::ActivationPolicy::Accessory
    } else {
        tauri::ActivationPolicy::Regular
    });
}
#[cfg(not(target_os = "macos"))]
fn apply_dock_policy(_app: &tauri::AppHandle, _hide: bool) {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::set_paused,
            commands::is_paused,
            commands::tracking_state,
            commands::dashboard_data,
            commands::keystroke_buckets,
            commands::screenshot_list,
            commands::browser_visits,
            commands::get_settings,
            commands::set_settings,
            commands::export_csv,
            commands::export_json,
            commands::permissions_status,
            commands::open_permission_settings,
            commands::request_screen_recording,
            commands::request_input_monitoring,
            commands::request_accessibility,
            commands::capture_now,
            commands::browser_link,
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
            let loaded = settings::load(&settings_path);
            settings::apply(&loaded, &control);
            let hide_dock = loaded.hide_dock;
            app.manage(settings::SettingsState {
                path: settings_path,
                current: std::sync::Mutex::new(loaded),
            });
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

            // Manage remaining state so commands can reach the DB.
            app.manage(db);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
