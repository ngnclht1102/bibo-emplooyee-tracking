# 16 — QA: permissions screen

- **Phase:** 2
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 15
- **Blocks:** —

## Goal
Confirm the permissions screen is clear and drives the grant flow correctly.

## Interactive checklist
- [ ] Start with all permissions denied — screen appears automatically on launch.
- [ ] Each `Open Settings →` opens the exact correct pane.
- [ ] Grant one permission — its row flips to Granted live, counter updates.
- [ ] Trigger a needs-restart case — `Quit & Reopen` works and the state is correct
      after relaunch.
- [ ] Revoke a permission while running — row flips back to Not granted.
- [ ] Grant all three — screen auto-advances to the dashboard.
- [ ] Status is readable by shape/text, not color alone; correct in both themes.

## Pass condition
All boxes checked. Any failure → reopen task 15.
