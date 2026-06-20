# 6 — QA: storage layer

- **Phase:** 1
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 5
- **Blocks:** —

## Goal
Confirm the DB is created correctly and survives restarts.

## Interactive checklist
- [ ] Launch the app; confirm `data.db` appears under
      `~/Library/Application Support/ctracking/`.
- [ ] Open it with a SQLite browser / `sqlite3` — all 4 tables + indexes exist.
- [ ] Quit and relaunch — no migration re-runs, data preserved, no errors in logs.
- [ ] Delete the DB, relaunch — it is recreated cleanly.

## Pass condition
All boxes checked. Any failure → reopen task 5.
