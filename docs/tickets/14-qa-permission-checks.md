# 14 — QA: permission checks

- **Phase:** 2
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 13
- **Blocks:** —

## Goal
Confirm permission detection matches reality and reacts live.

## Interactive checklist
- [ ] For each permission, toggle it in System Settings and watch the reported state
      flip in the app **without restart** (poll/focus re-check works).
- [ ] Revoke a granted permission mid-run — app detects it as denied.
- [ ] Deep-link opener opens the exact correct pane (test on at least macOS 26 and 15
      if available, plus the 13 floor).
- [ ] `needs_restart` appears where macOS requires a relaunch to take effect.

## Pass condition
All boxes checked. Any failure → reopen task 13.
