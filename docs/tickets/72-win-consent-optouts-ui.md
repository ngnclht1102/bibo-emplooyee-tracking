# 72 — M3b: First-run consent + Settings opt-outs (React)

- **Phase:** 6
- **Type:** Implementation
- **Status:** Blocked
- **Blocked by:** 71
- **Blocks:** 73

> Plan: [docs/12-windows-support-plan.md](../12-windows-support-plan.md) §3 workstream E, F.
> Screens: [apps/desktop/src/screens/](../../apps/desktop/src/screens/).

## Goal
Give Windows a clear **first-run consent** screen and **Settings opt-out toggles**, rendered
from the data-driven capability list (task 71) so one component serves macOS and Windows.

## Scope
- **Data-driven Permissions screen** ([Permissions.tsx](../../apps/desktop/src/screens/Permissions.tsx)):
  render whatever rows `permissions_status()` returns instead of three hardcoded macOS rows.
  Each row uses `label`, `description`, `state`, and conditionally shows
  "Open Settings" / "Request" buttons based on `can_open_settings` / `can_request`.
- **First-run consent (Windows):** on first launch (no consent flag persisted), show a
  consent screen explaining what's captured (active app/window, keystroke *counts*, periodic
  screenshots, browser pages) and that it's local-first / employer-visible. Persist a
  `consented: true` flag in settings; don't start screenshots/keyboard until consented.
- **Settings opt-outs** ([Settings.tsx](../../apps/desktop/src/screens/Settings.tsx)):
  toggles for "Capture screenshots" and "Count keystrokes" bound to the new settings fields
  from task 71. Respect org-managed lock (existing `CaptureManaged.locked()` path) — when the
  org manages capture, disable the toggles.
- **Wording pass** on [Activity.tsx](../../apps/desktop/src/screens/Activity.tsx) and
  [Screenshots.tsx](../../apps/desktop/src/screens/Screenshots.tsx): copy that reads correctly on
  Windows (no "Input Monitoring"/"Screen Recording" macOS-only phrasing when on Windows).
- **(Optional, workstream F)** map `hide_dock` → hide the taskbar button on Windows
  (Win32 `WS_EX_TOOLWINDOW` / Tauri `skip_taskbar`), or defer with a note if fiddly.

## Acceptance criteria
- [ ] macOS Permissions screen looks/behaves identical to before (3 rows, prompts, deep links).
- [ ] Windows shows consent on first run; capture doesn't start until the user consents.
- [ ] Settings opt-outs immediately stop/start screenshots & keystroke counting.
- [ ] Org-managed capture locks the toggles (parity with existing macOS behavior).
- [ ] No macOS-only permission wording appears on Windows.
- [ ] Frontend `tsc` + `vite build` pass.
