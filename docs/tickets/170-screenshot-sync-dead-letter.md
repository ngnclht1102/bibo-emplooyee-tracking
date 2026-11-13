# 170 — Desktop: screenshot sync retries rejected uploads forever (CTR-43)

## Problem
Production logged **3,145 x HTTP 400** on `POST /v1/sync/screenshots` in ~2 days
(reason `uploaded file is not an image`), from 6 desktop users; the worst one fired
roughly every 0.5s and kept growing. No 5xx — the backend is correct, it sniffs the
real bytes with `http.DetectContentType`.

Two client-side layers:

1. **No terminal state.** A non-network error from `sync_screenshot` was logged and
   `continue`d, leaving the row `synced = 0`. Every later sync pass re-uploaded it,
   so poisoned rows accumulated forever.
2. **Invalid capture files.** The multipart part is hard-labelled `image/webp`, so a
   zero-byte or truncated WebP on disk is rejected on sniff.

## Change (desktop only, no backend change)
- **Schema v3** (`screenshot.sync_attempts`, `screenshot.sync_dead`). `pending_screenshots`
  and `pending_count` skip dead rows; the row itself is kept for the local gallery and
  the retention pass.
- **Worker**: a failed upload bumps `sync_attempts`; after 5 attempts — or immediately
  on a permanent rejection — the row is marked dead and its orphan file deleted.
- **Permanent vs transient**: `status_err` prefixes `rejected:` on a 4xx other than
  401 / 408 / 429, so the worker can tell "will never be accepted" from "try later".
  Network errors still abort the pass and trigger backoff, unchanged.
- **Pre-upload guard**: a file that is not a RIFF/WEBP container is rejected client-side
  (`rejected:`, no request sent at all).
- **Capture guard**: an encoded buffer that is not valid WebP is discarded instead of
  being written to disk and queued.

## Verify
- `cargo test --lib` — 36 pass, incl. `dead_screenshot_leaves_the_pending_queue`
  (attempts bump, row stays pending, then dead → out of the queue and out of
  `pending_count`) and `is_webp_rejects_empty_and_truncated_captures`.
- `cargo check` clean.
- After shipping: the 400 rate on `/v1/sync/screenshots` should fall to ~0.

## Out of scope (also client-side, seen in the same logs)
- 117 x 400 on `/v1/sync/batch` — `multiple businesses: specify business_id`.
- 11 x 404 on `GET /v1/work/context`.
- 76 x 403 on `/v1/sync/batch` — device/membership not authorized.
