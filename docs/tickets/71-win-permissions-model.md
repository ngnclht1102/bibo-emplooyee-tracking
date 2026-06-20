# 71 — M3a: Data-driven permissions/consent model (Rust)

- **Phase:** 6
- **Type:** Implementation
- **Status:** Blocked
- **Blocked by:** 68
- **Blocks:** 72

> Plan: [docs/12-windows-support-plan.md](../12-windows-support-plan.md) §2 ("make the
> permissions/setup screen data-driven"), §3 workstream E.

## Goal
Replace the hardcoded three-macOS-permission contract with a **per-OS, data-driven**
capability list the React UI can render generically. macOS keeps its 3 TCC rows; Windows
shows consent/opt-out rows; future Linux is accommodated.

## Scope
- New backend shape in [platform/](../../apps/desktop/src-tauri/src/platform/) +
  [commands/mod.rs](../../apps/desktop/src-tauri/src/commands/mod.rs):
  - `permissions_status()` returns `Vec<CapabilityRow>` where
    `CapabilityRow { key: String, label: String, description: String,
    state: PermissionState, required: bool, can_request: bool, can_open_settings: bool }`.
  - Built **per-OS** in the active backend:
    - macOS: 3 rows — Accessibility, Input Monitoring, Screen Recording (current checks),
      `can_request`/`can_open_settings` = true.
    - Windows: rows describing what's captured (e.g. "Activity & keystrokes", "Screenshots")
      with `state` derived from the user's **opt-out toggles** (task 72), `required:false`,
      `can_request:false`, `can_open_settings:false`.
  - Keep `open_permission_settings(key)` / `request_*` commands working where applicable;
    on Windows they're no-ops (already stubbed).
- Preserve the existing typed commands or migrate call sites:
  - [trackers/mod.rs](../../apps/desktop/src-tauri/src/trackers/mod.rs) `start_screenshots`
    gates on screen-capture capability — on Windows gate on the screenshots opt-out instead
    of `permission_status(ScreenRecording)`.
- Wire opt-out state (task 72 persists it in [settings](../../apps/desktop/src-tauri/src/settings/)):
  add `capture_screenshots: bool` and `count_keystrokes: bool` to `Settings` (default true),
  read by trackers and reflected in the capability rows.

## Acceptance criteria
- [ ] `permissions_status()` returns the correct rows on each OS; the TS type is updated.
- [ ] macOS behavior is unchanged (same 3 rows, same grant/deny states, same deep links).
- [ ] Windows rows reflect the opt-out toggles; trackers honor the toggles (no screenshots /
      no keystrokes when opted out).
- [ ] `cargo check` clean on macOS + Windows.

## Notes
This is the half the plan originally folded into M1; it was deferred here so M1 could land
as "compiles & runs". Pairs with the UI in task 72.
