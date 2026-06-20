//! macOS platform backend (see docs/06-macos-compatibility.md).
//!
//! Screen capture / input permission checks, System Settings deep links, the
//! low-level key-down counting tap, and idle detection. Version branches are kept
//! here so they don't leak into the trackers. Selected by `#[cfg(target_os = "macos")]`
//! in `platform/mod.rs`, which re-exports everything below.

use super::{CapabilityRow, Permission, PermissionState, KEY_PRESS_COUNT};
use crate::settings::Settings;

/// The 3 macOS TCC rows for the data-driven setup screen. Ignores `Settings` —
/// state comes from the OS. All three are requestable + have Settings deep links.
pub fn capability_rows(_s: &Settings) -> Vec<CapabilityRow> {
    let row = |key: &str, label: &str, description: &str, p: Permission| CapabilityRow {
        key: key.to_string(),
        label: label.to_string(),
        description: description.to_string(),
        state: permission_status(p),
        required: true,
        can_request: true,
        can_open_settings: true,
    };
    vec![
        row(
            "accessibility",
            "Accessibility",
            "Lets the app read the active window/app for activity tracking.",
            Permission::Accessibility,
        ),
        row(
            "input_monitoring",
            "Input Monitoring",
            "Lets the app count keystrokes (counts only — never which keys).",
            Permission::InputMonitoring,
        ),
        row(
            "screen_recording",
            "Screen Recording",
            "Lets the app capture periodic screenshots.",
            Permission::ScreenRecording,
        ),
    ]
}

/// `x-apple.systempreferences:` deep link to the exact Settings pane.
fn settings_url(p: Permission) -> &'static str {
    match p {
        Permission::Accessibility => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
        }
        Permission::InputMonitoring => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent"
        }
        Permission::ScreenRecording => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
        }
    }
}

/// Open the System Settings pane for `p`. Falls back to the Privacy & Security
/// root if the specific pane id isn't recognized on this macOS version.
pub fn open_settings(p: Permission) {
    let url = settings_url(p);
    if std::process::Command::new("open").arg(url).spawn().is_err() {
        let _ = std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security")
            .spawn();
    }
}

// ---------- permission status ----------

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

/// Trigger the OS's first-time Screen Recording prompt (only this one can be
/// requested programmatically). Returns whether access is granted afterwards.
pub fn request_screen_recording() -> bool {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGRequestScreenCaptureAccess() -> bool;
    }
    unsafe { CGRequestScreenCaptureAccess() }
}

/// Ask macOS for Input Monitoring. This is what *registers* the app in the
/// Input Monitoring list and shows the first-time prompt. Returns current grant.
pub fn request_input_monitoring() -> bool {
    #[link(name = "IOKit", kind = "framework")]
    extern "C" {
        fn IOHIDRequestAccess(request: u32) -> bool;
    }
    const KIO_HID_REQUEST_TYPE_LISTEN_EVENT: u32 = 1;
    unsafe { IOHIDRequestAccess(KIO_HID_REQUEST_TYPE_LISTEN_EVENT) }
}

/// Prompt for Accessibility (with the system dialog). Registers the app in the
/// Accessibility list and prompts when not yet trusted. Returns current trust.
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

// ---------- keyboard counting tap (task 17) ----------
//
// A minimal, listen-only CoreGraphics event tap that ONLY counts key-down events.
// It never decodes which key was pressed (that decoding — via Text Input Source
// APIs that assert the main thread — is what crashed the `rdev` approach when run
// off the main thread). Counting-only is also exactly our privacy guarantee.

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
pub fn run_keyboard_tap() -> bool {
    keytap::run()
}

/// Seconds since the last user input (keyboard or mouse). Drives idle detection;
/// needs no special permission. Grows while the screen is locked or asleep, so
/// those states naturally count as idle.
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
