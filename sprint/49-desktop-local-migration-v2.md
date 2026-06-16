# 49 — Desktop: local schema migration v2 (sync columns)

- **Phase:** 5
- **Type:** Implementation
- **Status:** Blocked
- **Blocked by:** 5
- **Blocks:** 51, 53

## Goal
Add sync bookkeeping to the local SQLite tables per
[docs/11-backend-and-sync.md](../docs/11-backend-and-sync.md).

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
- [ ] Migration upgrades an existing v1 DB without data loss; backfills uuids.
- [ ] New inserts get a unique `client_uuid` and `synced = 0`.
- [ ] Incrementing a keystroke bucket flips it back to `synced = 0`.
- [ ] Pending-row queries use the partial index.
- [ ] `device_id` is stable across restarts.
