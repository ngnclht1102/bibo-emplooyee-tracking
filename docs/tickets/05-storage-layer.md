# 5 — SQLite storage layer + migrations

- **Phase:** 1
- **Type:** Implementation
- **Status:** Blocked
- **Blocked by:** 1
- **Blocks:** 6, 7, 11, 17, 19, 23

## Goal
A local SQLite database with the v1 schema and a migration mechanism, per
[docs/02-data-model.md](../02-data-model.md).

## Scope
- `rusqlite` with a bundled SQLite; DB at
  `~/Library/Application Support/ctracking/data.db` (create dir if missing).
- Versioned migrations creating: `activity_sample`, `keystroke_bucket`,
  `screenshot`, `browser_visit` (+ indexes).
- A storage module with typed insert/query helpers per table.
- Open the DB once on startup; safe access from background trackers (connection
  pool or mutex).

## Acceptance criteria
- [ ] First launch creates the DB file + all tables/indexes.
- [ ] Migrations are idempotent and versioned (re-running is a no-op).
- [ ] Insert + read round-trips work for each table (unit tests).
- [ ] Concurrent writes from trackers don't corrupt or lock-fail under normal load.
