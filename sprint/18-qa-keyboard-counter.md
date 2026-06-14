# 18 — QA: keyboard counter

- **Phase:** 2
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 17
- **Blocks:** —

## Goal
Confirm keypresses are counted accurately and privately.

## Interactive checklist
- [ ] Type a known number of keys (e.g. ~50) — the bucket count increases by roughly
      that amount.
- [ ] Inspect the DB + logs — **no actual keys/characters** are stored anywhere,
      only counts.
- [ ] Typing in any app (not just our window) is counted (global).
- [ ] Revoke Input Monitoring mid-run — counting pauses, no crash; re-grant — resumes.
- [ ] Counts land in the correct time bucket.

## Pass condition
All boxes checked. **Privacy check (no keys stored) is mandatory.** Any failure →
reopen task 17.
