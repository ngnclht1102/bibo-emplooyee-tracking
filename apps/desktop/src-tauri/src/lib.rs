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
            commands::export_csv,
        ])
        .setup(|app| {
            // Open the local SQLite DB under the app data dir.
            let data_dir = app.path().app_data_dir().expect("resolve app data dir");
            std::fs::create_dir_all(&data_dir).expect("create app data dir");
            let db_path = data_dir.join("data.db");
            let db = Arc::new(storage::Db::open(&db_path).expect("open database"));

            // Shared control surface for the trackers (pause, idle threshold).
            let control = Arc::new(trackers::TrackerControl::new());

            // Start the active-window + idle tracker.
            trackers::start(db.clone(), control.clone());

            // Manage state so commands can reach the DB and control.
            app.manage(db);
            app.manage(control);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
