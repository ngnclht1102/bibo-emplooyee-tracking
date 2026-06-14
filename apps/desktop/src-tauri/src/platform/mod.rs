//! macOS version-sensitive logic, kept in one place (see docs/06-macos-compatibility.md).
//!
//! Screen capture, permission status checks, System Settings deep links, and the
//! low-level input/idle + active-window reads all live here so version branches
//! don't leak into the trackers.
//!
//! Permission checks implemented in task 13; capture in task 19.

use serde::Serialize;

/// Permission state reported to the UI (see docs/03-macos-permissions.md).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionState {
    Granted,
    Denied,
    /// Granted by the OS but a tracker still can't use it — usually needs an app
    /// relaunch (e.g. the event tap). Surfaced by the trackers, not this module.
    NeedsRestart,
}

/// The macOS permissions this app needs (see docs/03-macos-permissions.md).
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

    /// `x-apple.systempreferences:` deep link to the exact Settings pane.
    fn settings_url(self) -> &'static str {
        match self {
            Self::Accessibility => {
                "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
            }
            Self::InputMonitoring => {
                "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent"
            }
            Self::ScreenRecording => {
                "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
            }
        }
    }
}

/// Open the System Settings pane for `p`. Falls back to the Privacy & Security
/// root if the specific pane id isn't recognized on this macOS version.
pub fn open_settings(p: Permission) {
    let url = p.settings_url();
    if std::process::Command::new("open").arg(url).spawn().is_err() {
        let _ = std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security")
            .spawn();
    }
}

// ---------- permission status (macOS) ----------

#[cfg(target_os = "macos")]
pub fn permission_status(p: Permission) -> PermissionState {
    // ApplicationServices: AXIsProcessTrusted (non-prompting).
    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrusted() -> u8;
    }
    // IOKit: IOHIDCheckAccess — 0 granted, 1 denied, 2 unknown.
    #[link(name = "IOKit", kind = "framework")]
    extern "C" {
        fn IOHIDCheckAccess(request: u32) -> u32;
    }
    // CoreGraphics: preflight screen capture without prompting.
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGPreflightScreenCaptureAccess() -> bool;
    }
    const KIO_HID_REQUEST_TYPE_LISTEN_EVENT: u32 = 1;
    const KIO_HID_ACCESS_TYPE_GRANTED: u32 = 0;

    let granted = match p {
        Permission::Accessibility => unsafe { AXIsProcessTrusted() != 0 },
        Permission::InputMonitoring => unsafe {
            IOHIDCheckAccess(KIO_HID_REQUEST_TYPE_LISTEN_EVENT) == KIO_HID_ACCESS_TYPE_GRANTED
        },
        Permission::ScreenRecording => unsafe { CGPreflightScreenCaptureAccess() },
    };
    if granted {
        PermissionState::Granted
    } else {
        PermissionState::Denied
    }
}

#[cfg(not(target_os = "macos"))]
pub fn permission_status(_p: Permission) -> PermissionState {
    PermissionState::Denied
}

/// Trigger the OS's first-time Screen Recording prompt (only this one can be
/// requested programmatically). Returns whether access is granted afterwards.
#[cfg(target_os = "macos")]
pub fn request_screen_recording() -> bool {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGRequestScreenCaptureAccess() -> bool;
    }
    unsafe { CGRequestScreenCaptureAccess() }
}

#[cfg(not(target_os = "macos"))]
pub fn request_screen_recording() -> bool {
    false
}

/// Ask macOS for Input Monitoring. This is what *registers* the app in the
/// Input Monitoring list and shows the first-time prompt. Returns current grant.
#[cfg(target_os = "macos")]
pub fn request_input_monitoring() -> bool {
    #[link(name = "IOKit", kind = "framework")]
    extern "C" {
        fn IOHIDRequestAccess(request: u32) -> bool;
    }
    const KIO_HID_REQUEST_TYPE_LISTEN_EVENT: u32 = 1;
    unsafe { IOHIDRequestAccess(KIO_HID_REQUEST_TYPE_LISTEN_EVENT) }
}

#[cfg(not(target_os = "macos"))]
pub fn request_input_monitoring() -> bool {
    false
}

/// Prompt for Accessibility (with the system dialog). Registers the app in the
/// Accessibility list and prompts when not yet trusted. Returns current trust.
#[cfg(target_os = "macos")]
pub fn request_accessibility() -> bool {
    use core_foundation::base::TCFType;
    use core_foundation::boolean::CFBoolean;
    use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
    use core_foundation::string::{CFString, CFStringRef};

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        static kAXTrustedCheckOptionPrompt: CFStringRef;
        fn AXIsProcessTrustedWithOptions(options: CFDictionaryRef) -> u8;
    }

    unsafe {
        let key = CFString::wrap_under_get_rule(kAXTrustedCheckOptionPrompt);
        let value = CFBoolean::true_value();
        let options = CFDictionary::from_CFType_pairs(&[(key.as_CFType(), value.as_CFType())]);
        AXIsProcessTrustedWithOptions(options.as_concrete_TypeRef()) != 0
    }
}

#[cfg(not(target_os = "macos"))]
pub fn request_accessibility() -> bool {
    false
}

// ---------- keyboard counting tap (task 17) ----------
//
// A minimal, listen-only CoreGraphics event tap that ONLY counts key-down events.
// It never decodes which key was pressed (that decoding — via Text Input Source
// APIs that assert the main thread — is what crashed the `rdev` approach when run
// off the main thread). Counting-only is also exactly our privacy guarantee.

/// Total key-down presses observed since last flush. The tap increments it; the
/// keyboard flusher swaps it out into per-minute buckets.
pub static KEY_PRESS_COUNT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

#[cfg(target_os = "macos")]
mod keytap {
    use super::KEY_PRESS_COUNT;
    use std::os::raw::c_void;
    use std::ptr;
    use std::sync::atomic::{AtomicPtr, Ordering};

    type CFMachPortRef = *mut c_void;
    type CFStringRef = *const c_void;
    type CGEventRef = *mut c_void;
    type CGEventTapProxy = *mut c_void;
    type CGEventTapCallBack =
        extern "C" fn(CGEventTapProxy, u32, CGEventRef, *mut c_void) -> CGEventRef;

    static TAP_PORT: AtomicPtr<c_void> = AtomicPtr::new(ptr::null_mut());

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventTapCreate(
            tap: u32,
            place: u32,
            options: u32,
            mask: u64,
            cb: CGEventTapCallBack,
            user: *mut c_void,
        ) -> CFMachPortRef;
        fn CGEventTapEnable(tap: CFMachPortRef, enable: bool);
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFMachPortCreateRunLoopSource(
            alloc: *const c_void,
            port: CFMachPortRef,
            order: i64,
        ) -> *mut c_void;
        fn CFRunLoopGetCurrent() -> *mut c_void;
        fn CFRunLoopAddSource(rl: *mut c_void, source: *mut c_void, mode: CFStringRef);
        fn CFRunLoopRun();
        static kCFRunLoopCommonModes: CFStringRef;
    }

    const KEY_DOWN: u32 = 10; // kCGEventKeyDown
    const TAP_DISABLED_TIMEOUT: u32 = 0xFFFF_FFFE;
    const TAP_DISABLED_USER_INPUT: u32 = 0xFFFF_FFFF;

    extern "C" fn callback(
        _proxy: CGEventTapProxy,
        etype: u32,
        event: CGEventRef,
        _user: *mut c_void,
    ) -> CGEventRef {
        if etype == KEY_DOWN {
            // COUNT ONLY — the key itself is never read or stored.
            KEY_PRESS_COUNT.fetch_add(1, Ordering::Relaxed);
        } else if etype == TAP_DISABLED_TIMEOUT || etype == TAP_DISABLED_USER_INPUT {
            // macOS can disable a slow tap; re-enable it.
            let p = TAP_PORT.load(Ordering::Relaxed);
            if !p.is_null() {
                unsafe { CGEventTapEnable(p, true) };
            }
        }
        event
    }

    /// Create a listen-only key-down tap and run its run loop (blocks while
    /// active). Returns `false` immediately if the tap can't be created — i.e.
    /// Input Monitoring isn't granted yet.
    pub fn run() -> bool {
        const HID_TAP: u32 = 0; // kCGHIDEventTap
        const HEAD_INSERT: u32 = 0; // kCGHeadInsertEventTap
        const LISTEN_ONLY: u32 = 1; // kCGEventTapOptionListenOnly
        let mask: u64 = 1u64 << KEY_DOWN;

        unsafe {
            let tap = CGEventTapCreate(
                HID_TAP,
                HEAD_INSERT,
                LISTEN_ONLY,
                mask,
                callback,
                ptr::null_mut(),
            );
            if tap.is_null() {
                return false;
            }
            TAP_PORT.store(tap, Ordering::Relaxed);
            let source = CFMachPortCreateRunLoopSource(ptr::null(), tap, 0);
            CFRunLoopAddSource(CFRunLoopGetCurrent(), source, kCFRunLoopCommonModes);
            CGEventTapEnable(tap, true);
            CFRunLoopRun(); // blocks while the tap is active
        }
        true
    }
}

/// Run the keyboard-counting tap (blocks while active). Returns false if the tap
/// couldn't be created (permission missing) so the caller can retry.
#[cfg(target_os = "macos")]
pub fn run_keyboard_tap() -> bool {
    keytap::run()
}

#[cfg(not(target_os = "macos"))]
pub fn run_keyboard_tap() -> bool {
    false
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
