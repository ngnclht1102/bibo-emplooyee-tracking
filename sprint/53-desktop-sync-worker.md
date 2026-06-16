# 53 — Desktop: sync worker

- **Phase:** 5
- **Type:** Implementation
- **Status:** Blocked
- **Blocked by:** 41, 43, 49, 51
- **Blocks:** —

## Goal
A background worker that pushes pending local rows to the backend per
[docs/11-backend-and-sync.md](../docs/11-backend-and-sync.md). One-directional: it only
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
- [ ] Pending rows reach the backend and flip to `synced = 1`.
- [ ] Offline → nothing sent, no errors; resumes when back online.
- [ ] Kill the app mid-batch → on restart, un-acked rows re-send with no backend duplicates.
- [ ] Backoff prevents hammering a down backend.
- [ ] Screenshots upload and mark synced; local files retained until synced (+ retention).
