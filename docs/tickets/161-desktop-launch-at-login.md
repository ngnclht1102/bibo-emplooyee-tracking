# 161 — Desktop: start at login (with optional "start minimized")

**Status:** Done — released in 1.7.0 and deployed to production 2026-11-04
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
  launch"; combined with `launch_minimized` it leaves the main window hidden.
- The main window is now created hidden (`"visible": false` in `tauri.conf.json`) and
  shown explicitly during `setup` on every launch **except** a minimized login start.
  Hiding it after the fact does **not** work on macOS — launch activation orders the
  window back to the front — and this way a minimized start never flashes the window.
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
- Release build: launch the `.app`, then `~/Library/LaunchAgents/employeetrack.plist`
  must exist (label = the **product name**, not the bundle id) with `RunAtLoad` true and
  `--autostart` in `ProgramArguments`; toggling the setting off removes it.
- All three launch paths were verified on a 1.7.0 release build by counting on-screen
  windows via `CGWindowListCopyWindowInfo`: `--autostart` + minimized on → 0 windows;
  no arg → 1; `--autostart` + minimized off → 1.
- **Gotcha while testing:** the live app data dir is
  `~/Library/Application Support/com.briannguyen.bibotracking/`. A stale
  `com.briannguyen.ctracking/` dir also exists and is *not* read — editing settings there
  looks like the feature is broken.
