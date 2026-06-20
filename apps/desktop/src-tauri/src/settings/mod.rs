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
    /// Run as a menu-bar-only app (no Dock icon).
    #[serde(default)]
    pub hide_dock: bool,
    /// Capture periodic screenshots. User opt-out (Settings). Default on.
    #[serde(default = "default_true")]
    pub capture_screenshots: bool,
    /// Count keystrokes (counts only, never keys). User opt-out (Settings). Default on.
    #[serde(default = "default_true")]
    pub count_keystrokes: bool,
    /// First-run consent acknowledged. Windows gates capture on this (no per-feature
    /// OS prompts there); macOS relies on TCC instead and ignores it. Default off.
    #[serde(default)]
    pub consented: bool,
    /// Personal mode: the user chose "Just me" on the welcome screen and runs fully
    /// local with no backend account. Skips the login screen entirely. Default off.
    #[serde(default)]
    pub local_only: bool,
    /// First-run onboarding flow finished (welcome → toggles → permissions). Default
    /// off so onboarding shows once per install.
    #[serde(default)]
    pub onboarding_completed: bool,
    /// Stable per-install device identifier (UUID), created on first run and never
    /// changed. Sent with auth + sync so the backend can attribute rows to a device.
    #[serde(default)]
    pub device_id: String,
    /// UI language code (e.g. "en", "zh", "ja"). Persisted so the native side
    /// (tray, notifications) can localize to match the in-app choice. Default "en".
    #[serde(default = "default_locale")]
    pub locale: String,
}

fn default_true() -> bool {
    true
}

fn default_locale() -> String {
    "en".into()
}

/// Compile-time default backend, pointing at the deployed tunnel. Not stored in
/// settings (so a stale settings.json can't pin it to localhost).
const DEFAULT_BACKEND_URL: &str = "https://employeetracking.namnguyen.pro";

/// Base URL of the sync backend. Production builds use [`DEFAULT_BACKEND_URL`];
/// for local dev, set `CTRACKING_BACKEND_URL=http://localhost:8080` before launch.
pub fn backend_base_url() -> String {
    std::env::var("CTRACKING_BACKEND_URL")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| DEFAULT_BACKEND_URL.to_string())
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            theme: "system".into(),
            idle_threshold_s: DEFAULT_IDLE_THRESHOLD_S,
            screenshot_interval_s: DEFAULT_SCREENSHOT_INTERVAL_S,
            screenshot_retention_days: DEFAULT_RETENTION_DAYS,
            domain_only: false,
            hide_dock: false,
            capture_screenshots: true,
            count_keystrokes: true,
            consented: false,
            local_only: false,
            onboarding_completed: false,
            device_id: String::new(),
            locale: default_locale(),
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

/// Load settings and guarantee a stable `device_id`. On first run (or an upgrade
/// from a config that predates the field) a fresh UUID is generated and persisted
/// so it stays identical across restarts.
pub fn load_with_device_id(path: &Path) -> Settings {
    let mut s = load(path);
    if s.device_id.is_empty() {
        s.device_id = uuid::Uuid::new_v4().to_string();
        let _ = save(path, &s);
    }
    s
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

    // Capture opt-outs. On Windows nothing captures until the user has consented
    // (there are no per-feature OS prompts); macOS relies on TCC and ignores consent.
    let consent_ok = !cfg!(target_os = "windows") || s.consented;
    control
        .capture_screenshots
        .store(s.capture_screenshots && consent_ok, Relaxed);
    control
        .count_keystrokes
        .store(s.count_keystrokes && consent_ok, Relaxed);
}

/// Whether the org controls capture settings for the signed-in employee. Default
/// (unmanaged) lets the user edit freely — used for standalone users and before a
/// policy is fetched.
#[derive(Debug, Clone, Copy, Default, Serialize)]
pub struct CaptureManaged {
    /// The user's org defines a capture policy.
    pub managed: bool,
    /// The org allows employees to override it anyway.
    pub allow_employee_override: bool,
    /// The org is a family (kind = 'family') — the onboarding shows "kid" copy.
    pub family: bool,
}

impl CaptureManaged {
    /// Capture settings are locked (org-managed and override not allowed).
    pub fn locked(&self) -> bool {
        self.managed && !self.allow_employee_override
    }
}

/// Managed state: the on-disk path, current in-memory settings, and the org policy
/// status applied at login.
pub struct SettingsState {
    pub path: std::path::PathBuf,
    pub current: Mutex<Settings>,
    pub managed: Mutex<CaptureManaged>,
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

    #[test]
    fn device_id_is_created_once_and_stable() {
        let dir = std::env::temp_dir().join(format!("ctracking_devid_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("settings.json");

        let first = load_with_device_id(&path);
        assert!(!first.device_id.is_empty());
        // Second load must return the exact same id (persisted, not regenerated).
        let second = load_with_device_id(&path);
        assert_eq!(first.device_id, second.device_id);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn backend_base_url_defaults_to_production() {
        // No override env set in the test harness.
        std::env::remove_var("CTRACKING_BACKEND_URL");
        assert_eq!(backend_base_url(), "https://employeetracking.namnguyen.pro");
    }
}
