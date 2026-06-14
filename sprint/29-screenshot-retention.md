# 29 — Screenshot retention / cleanup

- **Phase:** 4
- **Type:** Implementation
- **Status:** Blocked
- **Blocked by:** 19
- **Blocks:** —

## Goal
Keep screenshot storage bounded so the disk doesn't fill over time.

## Scope
- Background cleanup job enforcing caps: **max age** (e.g. 30 days) and/or **max
  total size** (e.g. 2 GB) — both configurable in Settings.
- Delete oldest PNGs first; remove the matching `screenshot` rows in the same step.
- Run on a schedule and on startup.

## Acceptance criteria
- [ ] Files older than the age cap are deleted, with their DB rows.
- [ ] When total size exceeds the cap, oldest files are pruned until under it.
- [ ] No orphaned files (file without row) or dangling rows (row without file).
- [ ] Caps are configurable and respected.
