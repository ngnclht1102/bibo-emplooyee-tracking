# 34 — Menu bar item & Dock visibility

- **Phase:** 5 (post-v1 enhancement)
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** 7 (idle signal), 9 (pause)
- **Blocks:** 35

## Goal
A macOS menu bar item showing tracking status with quick controls, plus the
ability to run as a menu-bar-only app (no Dock icon). See
[docs/09-menubar-and-dock.md](../docs/09-menubar-and-dock.md).

## Scope
- Tray (`tray-icon` feature) with menu: **Open main UI / Start / Stop / Quit**.
- Status badge refreshed ~2s: 🟢 tracking · 🟡 idle (not counting) · 🔴 paused.
- Single source of truth for pause (`tray::set_paused`): updates trackers, emits
  `tracking-paused`, refreshes badge; dashboard pill listens to the event.
- **Hide from Dock** setting → `Accessory`/`Regular` activation policy, live +
  persisted (`settings.json` `hide_dock`).
- Close-to-menu-bar: closing the window hides it; trackers keep running; Quit exits.

## Acceptance criteria
- [x] Menu bar item present; menu actions work.
- [x] Badge reflects tracking / idle / paused and updates live.
- [x] Pause stays in sync between tray and dashboard pill.
- [x] Hide-from-Dock toggles the Dock icon live and persists.
- [x] Closing the window keeps the app running in the menu bar.
