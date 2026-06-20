# 49 — Desktop: local schema migration v2 (sync columns)

- **Phase:** 5
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** 5
- **Blocks:** 51, 53

## Goal
Add sync bookkeeping to the local SQLite tables per
[docs/11-backend-and-sync.md](../11-backend-and-sync.md).

## Scope
- Migration v2 on `activity_sample`, `keystroke_bucket`, `screenshot`,
  `browser_visit`, adding:
  - `client_uuid TEXT NOT NULL UNIQUE` (backfill existing rows with generated uuids),
  - `synced INTEGER NOT NULL DEFAULT 0`,
  - `updated_at INTEGER NOT NULL`.
- Partial index per table: `... WHERE synced = 0`.
- Insert helpers generate `client_uuid` + set `updated_at`.
- **Any mutation resets `synced = 0` and bumps `updated_at`** — especially the
  `keystroke_bucket` upsert.
- A `device_id` (per-install uuid) stored in settings, created on first run.

## Acceptance criteria
- [x] Migration upgrades an existing v1 DB without data loss; backfills uuids.
- [x] New inserts get a unique `client_uuid` and `synced = 0`.
- [x] Incrementing a keystroke bucket flips it back to `synced = 0`.
- [x] Pending-row queries use the partial index.
- [x] `device_id` is stable across restarts.

## Notes
- `storage::migrate_2` adds `client_uuid TEXT` (nullable add → backfill fresh
  UUIDs → unique index, since SQLite can't add `NOT NULL UNIQUE` in one ALTER on a
  populated table), `synced INTEGER NOT NULL DEFAULT 0`, `updated_at INTEGER NOT
  NULL DEFAULT 0`, plus `idx_<table>_pending ... WHERE synced = 0` per table.
- Insert helpers generate a UUID + set `updated_at`; `add_keystrokes` upsert resets
  `synced = 0` and bumps `updated_at`.
- `device_id` lives in `settings.json` (`settings::load_with_device_id`), created
  once on first run. `backend_url` also added (default `http://localhost:8080`).
- New storage helpers: `pending_activity/keystrokes/browser/screenshots`,
  `mark_synced(SyncTable, &[uuid])`, `pending_count`.
- Tests added: migration backfill + no data loss, new inserts pending, keystroke
  increment re-pends, mark_synced clears, device_id stability.
