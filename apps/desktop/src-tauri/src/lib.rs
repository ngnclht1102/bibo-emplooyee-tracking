//! ctracking — local-only macOS activity tracker.
//! Module layout per docs/01-architecture.md.

mod commands;
mod platform;
mod storage;
mod trackers;

use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::set_paused,
            commands::is_paused,
            commands::dashboard_data,
            commands::keystroke_buckets,
            commands::screenshot_list,
            commands::export_csv,
            commands::permissions_status,
            commands::open_permission_settings,
            commands::request_screen_recording,
            commands::request_input_monitoring,
            commands::request_accessibility,
            commands::capture_now,
        ])
        .setup(|app| {
            // Open the local SQLite DB under the app data dir.
            let data_dir = app.path().app_data_dir().expect("resolve app data dir");
            std::fs::create_dir_all(&data_dir).expect("create app data dir");
            let db_path = data_dir.join("data.db");
            let db = Arc::new(storage::Db::open(&db_path).expect("open database"));

            // Shared control surface for the trackers (pause, idle threshold).
            let control = Arc::new(trackers::TrackerControl::new());

            // Register with macOS TCC up front so the app appears in the Accessibility
            // and Input Monitoring lists and the user gets the prompts. No-ops once
            // granted. (Screen Recording is requested from the Permissions screen.)
            platform::request_accessibility();
            platform::request_input_monitoring();

            // Start the active-window + idle tracker, keyboard counter, screenshots.
            let shots_dir = data_dir.join("screenshots");
            trackers::start(db.clone(), control.clone());
            trackers::start_keyboard(db.clone(), control.clone());
            trackers::start_screenshots(db.clone(), control.clone(), shots_dir);

            // Manage state so commands can reach the DB and control.
            app.manage(db);
            app.manage(control);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
