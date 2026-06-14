//! macOS version-sensitive logic, kept in one place (see docs/06-macos-compatibility.md).
//!
//! Screen capture, permission status checks, System Settings deep links, and the
//! low-level input/idle + active-window reads all live here so version branches
//! don't leak into the trackers.
//!
//! Permission checks implemented in task 13; capture in task 19.

/// Permission state reported to the UI (see docs/03-macos-permissions.md).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PermissionState {
    Granted,
    Denied,
    NeedsRestart,
}

/// Foreground window info (task 7). `title` is `None` when unavailable (e.g. the
/// window name isn't exposed without Screen Recording on newer macOS).
#[derive(Debug, Clone)]
pub struct ActiveWindowInfo {
    pub app_name: String,
    pub title: Option<String>,
    pub pid: i64,
}

/// The active foreground window, or `None` if there isn't one / it can't be read.
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

/// Seconds since the last user input (keyboard or mouse). Drives idle detection;
/// needs no special permission. Grows while the screen is locked or asleep, so
/// those states naturally count as idle.
#[cfg(target_os = "macos")]
pub fn idle_seconds() -> f64 {
    // kCGEventSourceStateHIDSystemState = 1, kCGAnyInputEventType = 0xFFFFFFFF.
    const HID_SYSTEM_STATE: u32 = 1;
    const ANY_INPUT_EVENT: u32 = 0xFFFF_FFFF;
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(state: u32, event_type: u32) -> f64;
    }
    unsafe { CGEventSourceSecondsSinceLastEventType(HID_SYSTEM_STATE, ANY_INPUT_EVENT) }
}

#[cfg(not(target_os = "macos"))]
pub fn idle_seconds() -> f64 {
    0.0
}
