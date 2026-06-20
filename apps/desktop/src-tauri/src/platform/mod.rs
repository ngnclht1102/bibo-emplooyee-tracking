//! Platform abstraction layer.
//!
//! Trackers, commands, and `lib.rs` call the stable API defined here; the active
//! OS backend (`macos.rs` / `windows.rs`) is selected by `cfg` and re-exported.
//! OS-specific input/idle, screen-capture permission checks, and Settings deep
//! links live in the backend modules so version/OS branches don't leak into the
//! trackers. Truly cross-platform bits (active window, the key-press counter,
//! shared types) stay here.
//!
//! See docs/12-windows-support-plan.md §2 for the port plan.

use serde::Serialize;

// ---------- active OS backend ----------

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::*;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
pub use windows::*;

// ---------- shared types ----------

/// Permission state reported to the UI (see docs/03-macos-permissions.md). On
/// Windows there are no per-feature OS prompts, so the backend reports `Granted`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionState {
    Granted,
    Denied,
    /// Granted by the OS but a tracker still can't use it — usually needs an app
    /// relaunch (e.g. the event tap). Surfaced by the trackers, not this module.
    NeedsRestart,
}

/// A capability the app gates on. Named after the macOS TCC permissions; on
/// Windows the backend treats them all as granted (consent is opt-out, not OS).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Permission {
    Accessibility,
    InputMonitoring,
    ScreenRecording,
}

impl Permission {
    pub fn from_key(key: &str) -> Option<Self> {
        match key {
            "accessibility" => Some(Self::Accessibility),
            "input_monitoring" => Some(Self::InputMonitoring),
            "screen_recording" => Some(Self::ScreenRecording),
            _ => None,
        }
    }
}

/// One row of the permissions/consent setup screen, built per-OS so the React UI
/// can render whatever it's given (see docs/12 §2). macOS yields the 3 TCC rows;
/// Windows yields capture/consent rows derived from the user's opt-out settings.
#[derive(Debug, Clone, Serialize)]
pub struct CapabilityRow {
    /// Stable identifier the UI passes back to `open_permission_settings` / `request_*`.
    pub key: String,
    pub label: String,
    pub description: String,
    pub state: PermissionState,
    /// The app can't function fully without it (drives "required" styling).
    pub required: bool,
    /// An in-app `request_*` call can prompt for it (macOS only).
    pub can_request: bool,
    /// A System Settings deep link exists for it (macOS only).
    pub can_open_settings: bool,
}

/// Foreground window info (task 7). `title` is `None` when unavailable (e.g. the
/// window name isn't exposed without Screen Recording on newer macOS).
#[derive(Debug, Clone)]
pub struct ActiveWindowInfo {
    pub app_name: String,
    pub title: Option<String>,
    pub pid: i64,
}

/// Total key-down presses observed since the last flush. The OS backend's
/// keyboard counter increments it; the keyboard flusher swaps it out into
/// per-minute buckets. The key itself is never decoded or stored.
pub static KEY_PRESS_COUNT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

// ---------- cross-platform implementations ----------

/// The active foreground window, or `None` if there isn't one / it can't be read.
/// `active-win-pos-rs` is cross-platform (macOS + Windows), so this lives here.
pub fn active_window() -> Option<ActiveWindowInfo> {
    match active_win_pos_rs::get_active_window() {
        Ok(w) => {
            let title = w.title.trim();
            Some(ActiveWindowInfo {
                app_name: w.app_name,
                title: if title.is_empty() {
                    None
                } else {
                    Some(title.to_string())
                },
                pid: w.process_id as i64,
            })
        }
        Err(_) => None,
    }
}
