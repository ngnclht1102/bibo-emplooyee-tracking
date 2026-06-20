# 43 — Screenshot upload endpoint

- **Phase:** 5
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** 41
- **Blocks:** 45, 47, 53

## Goal
Multipart screenshot ingest + filesystem store per
[docs/11-backend-and-sync.md](../11-backend-and-sync.md).

## Scope
- Migration: `screenshots` (client_uuid, user_id, business_id, device_id, ts,
  file_path, byte_size, width, height, display_id, client_updated_at, received_at).
- `POST /v1/sync/screenshots` — multipart (metadata fields + image bytes).
- `internal/filestore`: write to
  `storage/screenshots/<business_id>/<user_id>/<yyyy-mm-dd>/<client_uuid>.webp`.
  Filenames are uuid-only; reject any client-supplied path component (traversal-safe).
- Reject uploads over a max size guard (e.g. 200 KB) and non-image content types.
- Upsert metadata by `client_uuid` (idempotent); file write is overwrite-safe.
- Return accepted uuids.

## Acceptance criteria
- [ ] Upload writes the file under the dated business/user path and a `screenshots` row.
- [ ] Re-upload of same `client_uuid` doesn't duplicate the row; file overwrite is safe.
- [ ] Oversized (>200 KB) or non-image upload → 4xx, nothing written.
- [ ] Path traversal attempts in metadata can't escape `storage/screenshots/`.
- [ ] `byte_size` recorded matches the stored file.
