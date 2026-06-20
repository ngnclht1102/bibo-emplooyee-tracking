//! Windows platform backend (see docs/12-windows-support-plan.md §3).
//!
//! Selected by `#[cfg(target_os = "windows")]` in `platform/mod.rs`, which
//! re-exports everything below. Windows has no per-feature OS permission prompts,
//! so the permission API reports `Granted` and the request/open-settings calls are
//! no-ops; first-run consent + Settings opt-outs are handled in the UI (M3).
//!
//! Implemented now (M1): idle detection via `GetLastInputInfo`. Active window and
//! screenshots are cross-platform (`active-win-pos-rs` / `xcap`) and live elsewhere.
//! Keyboard counting (M2) is stubbed — see `run_keyboard_tap`.

use super::{CapabilityRow, Permission, PermissionState};
use crate::settings::Settings;

/// Windows capture/consent rows for the data-driven setup screen. There are no
/// per-feature OS prompts, so state is derived from the user's opt-out toggles and
/// whether they've consented; nothing is requestable or has a Settings deep link.
pub fn capability_rows(s: &Settings) -> Vec<CapabilityRow> {
    let state = |enabled: bool| {
        if s.consented && enabled {
            PermissionState::Granted
        } else {
            PermissionState::Denied
        }
    };
    vec![
        CapabilityRow {
            key: "keystrokes".to_string(),
            label: "Activity & keystroke counts".to_string(),
            description: "Tracks the active app/window and counts keystrokes (counts only — \
                          never which keys are pressed)."
                .to_string(),
            state: state(s.count_keystrokes),
            required: false,
            can_request: false,
            can_open_settings: false,
        },
        CapabilityRow {
            key: "screenshots".to_string(),
            label: "Screenshots".to_string(),
            description: "Captures periodic screenshots of your screen(s).".to_string(),
            state: state(s.capture_screenshots),
            required: false,
            can_request: false,
            can_open_settings: false,
        },
    ]
}

/// No-op on Windows: there is no System Settings pane to grant a per-feature
/// permission. Opt-outs live in the app's own Settings screen.
pub fn open_settings(_p: Permission) {}

/// Windows has no per-feature OS permission model — everything is available
/// unless the user opts out in-app, so report `Granted`.
pub fn permission_status(_p: Permission) -> PermissionState {
    PermissionState::Granted
}

/// No OS prompt to request on Windows; capture works unless opted out in-app.
pub fn request_screen_recording() -> bool {
    true
}

/// No OS prompt to request on Windows.
pub fn request_input_monitoring() -> bool {
    true
}

/// No OS prompt to request on Windows.
pub fn request_accessibility() -> bool {
    true
}

/// Low-level keyboard hook callback. Runs on the thread that installed the hook
/// (see `run_keyboard_tap`). COUNT ONLY — we increment on key-down and never read
/// the key code / scan code from `lparam`, preserving the same privacy guarantee
/// as the macOS event tap.
unsafe extern "system" fn keyboard_hook_proc(
    code: i32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
) -> windows::Win32::Foundation::LRESULT {
    use std::sync::atomic::Ordering;
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, HC_ACTION, HHOOK, WM_KEYDOWN, WM_SYSKEYDOWN,
    };

    // Only act on HC_ACTION; anything < 0 must be passed straight through.
    if code == HC_ACTION as i32 {
        let msg = wparam.0 as u32;
        if msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN {
            super::KEY_PRESS_COUNT.fetch_add(1, Ordering::Relaxed);
        }
    }
    // hhk is ignored by the OS; pass a null handle.
    CallNextHookEx(HHOOK::default(), code, wparam, lparam)
}

/// Install a `WH_KEYBOARD_LL` low-level keyboard hook and pump messages so it
/// fires (low-level hooks are delivered to the installing thread's message queue).
/// Blocks while active; the caller (`trackers::start_keyboard`) runs this on a
/// dedicated thread in a retry loop. Returns `false` immediately if the hook can't
/// be installed, so the caller idles and retries instead of busy-looping.
///
/// Note (see plan §8): a low-level hook cannot observe input routed to a
/// higher-integrity/elevated foreground app — counts simply pause for that window;
/// the app never crashes.
pub fn run_keyboard_tap() -> bool {
    use windows::Win32::Foundation::HINSTANCE;
    use windows::Win32::UI::WindowsAndMessaging::{
        DispatchMessageW, GetMessageW, SetWindowsHookExW, TranslateMessage, UnhookWindowsHookEx,
        MSG, WH_KEYBOARD_LL,
    };

    unsafe {
        // hMod = NULL is permitted for WH_KEYBOARD_LL; the proc lives in-process.
        let hook = match SetWindowsHookExW(
            WH_KEYBOARD_LL,
            Some(keyboard_hook_proc),
            HINSTANCE::default(),
            0,
        ) {
            Ok(h) => h,
            Err(_) => return false,
        };

        // Message loop: GetMessageW blocks and lets the system deliver hook
        // callbacks on this thread. We never post WM_QUIT, so this runs until the
        // process exits; on the unexpected `0`/`-1` return we fall through and
        // unhook so the caller can retry.
        let mut msg = MSG::default();
        loop {
            let r = GetMessageW(&mut msg, None, 0, 0).0;
            if r == 0 || r == -1 {
                break;
            }
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }

        let _ = UnhookWindowsHookEx(hook);
    }
    true
}

/// Seconds since the last user input (keyboard or mouse), via `GetLastInputInfo`.
/// Needs no special permission. Like the macOS path, it grows while the session is
/// locked or the display is asleep, so those states count as idle.
pub fn idle_seconds() -> f64 {
    use windows::Win32::System::SystemInformation::GetTickCount;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};

    let mut info = LASTINPUTINFO {
        cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
        dwTime: 0,
    };
    unsafe {
        if GetLastInputInfo(&mut info).as_bool() {
            // Both are 32-bit millisecond tick counts that wrap ~every 49 days;
            // wrapping_sub gives the correct elapsed interval across a wrap.
            let idle_ms = GetTickCount().wrapping_sub(info.dwTime);
            idle_ms as f64 / 1000.0
        } else {
            0.0
        }
    }
}
