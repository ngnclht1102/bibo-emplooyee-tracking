# 13 — Permission status checks + Tauri commands

- **Phase:** 2
- **Type:** Implementation
- **Status:** Blocked
- **Blocked by:** 1
- **Blocks:** 14, 15, 17, 19

## Goal
Reliably detect the status of each required macOS permission and expose it to the UI,
per [docs/03-macos-permissions.md](../03-macos-permissions.md).

## Scope
- Rust checks (non-prompting on poll):
  - Accessibility — `AXIsProcessTrustedWithOptions`.
  - Input Monitoring — `IOHIDCheckAccess(kIOHIDRequestTypeListenEvent)`.
  - Screen Recording — `CGPreflightScreenCaptureAccess` (+ request variant for first
    prompt).
- A `platform` function returning per-permission `granted | denied | needs_restart`.
- Tauri command the UI can poll; emit an event on change.
- Deep-link opener command for each Settings pane (with per-version fallback to the
  Privacy & Security root).

## Acceptance criteria
- [ ] Each permission reports the correct state vs System Settings.
- [ ] State updates without restarting the app (poll/focus re-check).
- [ ] `needs_restart` is surfaced where applicable (e.g. event tap).
- [ ] Deep-link commands open the correct panes on macOS 13–26.
