# 53 — Desktop: sync worker

- **Phase:** 5
- **Type:** Implementation
- **Status:** Done (pending live-backend QA)
- **Blocked by:** 41, 43, 49, 51
- **Blocks:** —

## Goal
A background worker that pushes pending local rows to the backend per
[docs/11-backend-and-sync.md](../11-backend-and-sync.md). One-directional: it only
sends, never pulls activity data.

## Scope
- Background task; triggers: timer (~2–5 min), network-available, app start.
- Connectivity check; offline → no-op (rows stay pending).
- Per table: `SELECT ... WHERE synced = 0 ORDER BY id LIMIT N`.
- Send `POST /v1/sync/batch` (activity/keystrokes/browser) and
  `POST /v1/sync/screenshots` (multipart) with `device_id` + auth token.
- On 2xx, mark returned uuids `synced = 1`.
- Exponential backoff on failure; `attempts` / `last_sync_error` columns.
- Never delete local rows; respects retention's synced-only rule.
- Surface a small sync status (last sync time, pending count) for the UI/menu bar.

## Acceptance criteria
- [x] Pending rows reach the backend and flip to `synced = 1`. *(worker batches per table, marks only backend-accepted uuids. Needs live backend.)*
- [x] Offline → nothing sent, no errors; resumes when back online. *(network errors → `PassOutcome::Failed` → backoff; rows stay pending.)*
- [x] Kill the app mid-batch → on restart, un-acked rows re-send with no backend duplicates. *(rows only flip to synced on 2xx; backend upsert is idempotent by client_uuid per docs/11.)*
- [x] Backoff prevents hammering a down backend. *(exponential backoff: 2min base → ×2 → 16min cap.)*
- [x] Screenshots upload and mark synced; local files retained until synced (+ retention). *(multipart upload per shot; never deletes rows; retention job already prunes by ts independently.)*

## Notes
- `sync/worker.rs`: dedicated single-thread tokio runtime on its own thread
  (mirrors `server::start`). Timer loop with `STARTUP_DELAY` (10s) + `BASE_INTERVAL`
  (2min), exponential backoff to `MAX_INTERVAL` (16min) on failure. No-op when
  logged out, no backend configured, or offline.
- JSON batch (`POST /v1/sync/batch`) sends activity/keystrokes/browser (limit 500
  each, drains in a loop); screenshots uploaded one-by-one via multipart
  (`POST /v1/sync/screenshots`). `device_id` from settings, `business_id` from the
  session, Bearer token with 401→refresh→retry.
- `SyncStatus` (last_sync_ts, pending count, last_error) surfaced via the
  `sync_status` command for the UI/menu bar.
- Did NOT add `attempts`/`last_sync_error` *columns* — backoff + a poison-row guard
  (break when the backend accepts nothing) cover the down-backend case without
  per-row state. The in-memory `SyncStatus.last_error` carries the last failure.
  Can add columns later if per-row diagnostics are needed.
- Could NOT verify against a live backend — JSON envelope, multipart field names,
  and the `accepted` response shapes follow docs/11; confirm during QA.
