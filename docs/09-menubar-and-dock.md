# Menu bar item & Dock visibility

A macOS menu bar (status bar) item gives at-a-glance tracking status and quick
controls, and the app can run as a menu-bar-only background app (no Dock icon).

## Menu bar item

Always present in the menu bar while the app runs. Implemented with Tauri's
`tray-icon` feature (`src-tauri/src/tray/mod.rs`).

**Menu:**
- **Open main UI** — show + focus the main window (works even when hidden)
- **Start** — resume tracking
- **Stop** — pause tracking
- **Quit ctracking** — fully exit the app

**Status indicator** (a colored badge next to the icon, refreshed every ~2s):

| Badge | State | Meaning |
|---|---|---|
| 🟢 | Tracking | User present and active — time is being counted |
| 🟡 | Idle | No input past the idle threshold — **present but not counting active time** |
| 🔴 | Paused | Tracking stopped (via Stop / the dashboard pill) |

The tooltip mirrors the state. Status is derived from the same signals as the
trackers: `paused` flag + `CGEventSourceSecondsSinceLastEventType` vs the idle
threshold (see [01-architecture.md](01-architecture.md)).

### One source of truth for pause

`tray::set_paused` is the only place pause changes. It updates `TrackerControl`,
emits a `tracking-paused` event, and refreshes the badge. Both the tray menu and
the dashboard's Tracking pill go through it (the pill listens to the event), so
they never disagree. Tray updates are dispatched to the main thread
(`run_on_main_thread`) since AppKit status-item updates must happen there.

## Hide from Dock (menu-bar-only mode)

**Settings → General → Hide from Dock** toggles whether the app shows a Dock icon.

- **On:** macOS activation policy `Accessory` — no Dock icon; the app lives only in
  the menu bar.
- **Off (default):** policy `Regular` — normal Dock icon.

Applied live (`AppHandle::set_activation_policy`) and persisted in `settings.json`
(`hide_dock`), so it survives restarts.

### Close-to-menu-bar

Closing the main window does **not** quit the app — the window is hidden and the
background trackers keep running. Reopen via the menu bar → **Open main UI**. Use
**Quit ctracking** to actually exit. This keeps tracking alive in menu-bar-only
mode where there's no Dock icon to relaunch from.

## Notes

- The badge uses colored emoji, which render in color in the macOS menu bar. A
  custom monochrome template icon could replace the app icon later for a more native
  look.
- In `tauri dev` the app may be torn down by the dev launcher; a packaged,
  code-signed `.app` runs independently and stays in the menu bar as designed.
