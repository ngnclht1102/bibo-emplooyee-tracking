# 15 — Permissions screen UI

- **Phase:** 2
- **Type:** Implementation
- **Status:** Blocked
- **Blocked by:** 3, 13
- **Blocks:** 16

## Goal
The dedicated permissions screen from
[docs/03-macos-permissions.md](../docs/03-macos-permissions.md) — clear status + a
button per permission to open the right Settings pane.

## Scope
- One row per permission (Accessibility, Input Monitoring, Screen Recording):
  status indicator (**icon + text**, never hue-only), name, one-line purpose,
  right-aligned action.
- States: Granted (pill, no button) · Not granted (`Open Settings →`) ·
  Needs restart (`Quit & Reopen`) · Revoked mid-run (flips back to Not granted).
- Shown automatically on launch if any permission missing; also reachable from
  Settings → Permissions.
- Live re-check (poll ~1–2s and on window focus) + manual `Re-check` button.
- Footer: "N of 3 granted" + restart note. Auto-advance when all granted.
- Styled with tokens; correct in dark + light.

## Acceptance criteria
- [ ] Rows reflect real permission state and update live after granting.
- [ ] `Open Settings →` opens the correct pane; `Quit & Reopen` relaunches.
- [ ] Status uses icon + label (accessible), not color alone.
- [ ] Auto-advances to dashboard once all three are granted.
- [ ] Looks correct in both themes.
