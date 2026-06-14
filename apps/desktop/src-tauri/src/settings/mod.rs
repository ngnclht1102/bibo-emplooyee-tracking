//! Persisted user settings (`settings.json` in the app data dir).
//!
//! On startup these are loaded and applied to `TrackerControl` (which the trackers
//! and ingest server read live). The UI reads/writes them via commands.

use std::path::Path;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::trackers::{
    DEFAULT_IDLE_THRESHOLD_S, DEFAULT_RETENTION_DAYS, DEFAULT_SCREENSHOT_INTERVAL_S,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    /// "light" | "dark" | "system" — applied by the UI.
    pub theme: String,
    pub idle_threshold_s: u64,
    pub screenshot_interval_s: u64,
    pub screenshot_retention_days: u64,
    /// Store only the site origin for browser visits, not the full URL.
    pub domain_only: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            theme: "system".into(),
            idle_threshold_s: DEFAULT_IDLE_THRESHOLD_S,
            screenshot_interval_s: DEFAULT_SCREENSHOT_INTERVAL_S,
            screenshot_retention_days: DEFAULT_RETENTION_DAYS,
            domain_only: false,
        }
    }
}

/// Load settings from `path`, falling back to defaults if missing/invalid.
pub fn load(path: &Path) -> Settings {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Persist settings to `path` (pretty JSON).
pub fn save(path: &Path, settings: &Settings) -> std::io::Result<()> {
    let json = serde_json::to_string_pretty(settings).unwrap_or_default();
    std::fs::write(path, json)
}

/// Push settings into the live `TrackerControl` the trackers + server read.
pub fn apply(s: &Settings, control: &crate::trackers::TrackerControl) {
    use std::sync::atomic::Ordering::Relaxed;
    control.idle_threshold_s.store(s.idle_threshold_s, Relaxed);
    control.screenshot_interval_s.store(s.screenshot_interval_s, Relaxed);
    control
        .screenshot_retention_days
        .store(s.screenshot_retention_days, Relaxed);
    control.domain_only.store(s.domain_only, Relaxed);
}

/// Managed state: the on-disk path + the current in-memory settings.
pub struct SettingsState {
    pub path: std::path::PathBuf,
    pub current: Mutex<Settings>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn load_defaults_when_missing() {
        let s = load(Path::new("/nonexistent/ctracking/settings.json"));
        assert_eq!(s.idle_threshold_s, DEFAULT_IDLE_THRESHOLD_S);
        assert!(!s.domain_only);
    }

    #[test]
    fn save_then_load_round_trips() {
        let dir = std::env::temp_dir().join(format!("ctracking_settings_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("settings.json");
        let mut s = Settings::default();
        s.domain_only = true;
        s.screenshot_interval_s = 600;
        save(&path, &s).unwrap();
        let loaded = load(&path);
        assert!(loaded.domain_only);
        assert_eq!(loaded.screenshot_interval_s, 600);
        std::fs::remove_dir_all(&dir).ok();
    }
}
