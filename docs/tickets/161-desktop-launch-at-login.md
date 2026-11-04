# 161 — Desktop: start at login (with optional "start minimized")

**Status:** Implemented (local only)
**Date:** 2026-11-04
**Shipped in:** 1.7.0

## Problem
The tracker had no way to start itself. Every user had to open the app by hand after a
reboot, so a forgotten launch meant a silent gap in that day's activity.

## What was added
Two settings under **Settings → General**:

| Setting | Default | Effect |
|---|---|---|
| `launch_on_login` | **on** | Registers the app with the OS login items. |
| `launch_minimized` | off | A login-triggered launch stays in the menu bar / tray instead of opening the window. Only shown while `launch_on_login` is on. |

Default is "on, window shows" — the tracker is meant to always run, and a visible window
on the first login makes it obvious the app started.

## How it works
- `tauri-plugin-autostart` writes a LaunchAgent plist on macOS (`MacosLauncher::LaunchAgent`)
  and a `Run` registry key on Windows. All control is Rust-side, so no new capability
  permission was needed.
- The login item passes `--autostart`. The app treats that arg as "this was a login
  launch"; combined with `launch_minimized` it hides the main window during `setup`
  (the tray is already built by then, and close-to-tray behaviour is unchanged).
- The OS entry is reconciled on every startup from the saved setting, and again in
  `set_settings` when the toggle actually changes.
- **Debug builds skip registration entirely** so a `tauri dev` run never installs the dev
  binary as a login item. The feature is therefore only testable from a release build.

## Notes / gotchas
- `tauri-plugin-autostart` is pinned to `=2.5.0`. 2.6+ requires tauri 2.12, which would
  have pulled wry/tao/tray-icon up with it — not something to absorb during a release.
- Upgrading users get `launch_on_login: true` from the serde default, so 1.7.0 registers
  the login item on its first run.
- The login item records the installed app path, so it only behaves correctly for an app
  in `/Applications` (mac) or a real install (Windows).

## Verify
- `cargo check` in `apps/desktop/src-tauri`; `tsc --noEmit` + `vite build` in `apps/desktop`.
- Release build: launch the `.app`, then
  `ls ~/Library/LaunchAgents/com.briannguyen.ctracking.plist` must exist; toggling the
  setting off removes it.
