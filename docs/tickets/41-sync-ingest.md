# 41 — Sync ingest endpoints (idempotent)

- **Phase:** 5
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** 37
- **Blocks:** 43, 45, 53

> Note: `user_id` is never accepted from the request body — the batch envelope has no
> such field, so it's structurally impossible to spoof; it's always taken from the
> token. `business_id` is optional in the payload and only needed when a user belongs
> to more than one business (otherwise resolved from the single membership).

## Goal
Idempotent batch ingest for activity/keystrokes/browser per
[docs/11-backend-and-sync.md](../11-backend-and-sync.md).

## Scope
- Migrations: `activity_samples`, `keystroke_buckets`, `browser_visits` — each with
  `client_uuid uuid UNIQUE`, `user_id`, `business_id`, `device_id`,
  `client_updated_at`, `received_at`.
- `POST /v1/sync/batch` — JSON envelope `{device_id, activity[], keystrokes[], browser[]}`.
- `user_id` from token; `business_id` resolved from the user's employee membership;
  reject if the device/user mismatch.
- Upsert `ON CONFLICT (client_uuid) DO UPDATE` with client values (respect-local).
- Response returns accepted `client_uuid`s per kind.
- Register/update `devices` row from `device_id` + `last_seen_at`.

## Acceptance criteria
- [ ] A batch inserts rows; re-POSTing the identical batch creates **no** duplicates.
- [ ] Changed payload for an existing `client_uuid` overwrites (local wins).
- [ ] Response lists exactly the accepted uuids.
- [ ] Rows are stamped with the token's `user_id` even if the body claims another.
- [ ] Malformed/oversized batches are rejected with clear 4xx.
