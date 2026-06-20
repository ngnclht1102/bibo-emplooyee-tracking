# 20 — QA: screenshots

- **Phase:** 2
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 19
- **Blocks:** —

## Goal
Confirm periodic capture works and is correct on real hardware/macOS versions.

## Interactive checklist
- [ ] Set a short interval; confirm screenshots appear on disk on schedule.
- [ ] Open the PNGs — they show the actual screen (not black/blank).
- [ ] **macOS 26 specifically:** capture works, no black frames or API warnings.
- [ ] Multi-display: each connected display is captured.
- [ ] DB metadata (ts, path, dimensions, display) matches the files.
- [ ] Revoke Screen Recording mid-run — capture pauses; re-grant — resumes.

## Pass condition
All boxes checked. macOS 26 capture is mandatory. Any failure → reopen task 19.
