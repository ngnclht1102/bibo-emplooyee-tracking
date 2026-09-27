# 143 — Screenshot upload switch: capture but keep local only

**Status:** Implemented (manual QA pending)
**Area:** backend (capture policy + upload enforcement) + web-admin (org Settings) + desktop (settings, sync worker, local DB, React Settings UI)

## Goal

Let a user — or an org on behalf of its members — **stop screenshots from being
uploaded**, while everything else keeps working:

- Screenshots are still **captured** on the schedule and still land in the
  **local gallery** on the device.
- They are **never sent** to the server, so they never appear in the owner
  dashboard.
- Only screenshots are affected. Activity samples, keystroke counts and browser
  visits keep syncing normally.

Org-controlled like the rest of the capture policy: when the org manages capture
and `allow_employee_override` is off, the member can't change it. There is **no
new override mechanism** — it reuses the single existing capture-policy switch.

## Design decisions

**Queued screenshots are never flushed.** When upload is off, pending screenshot
rows are *retired* (pending flag cleared) without being sent. Turning upload back
on therefore uploads **only new** screenshots — the backlog stays local forever.
This matches the intent of someone switching it off *because* something sensitive
was captured, and keeps the pending counter from growing without bound (which
would otherwise read as a stuck sync).

**Enforced server-side as well as client-side.** The backend rejects screenshot
uploads for a business whose policy forbids them, so a stale, offline-cached or
tampered desktop build can't upload anyway. The rejection carries the distinct
code `screenshot_upload_disabled`; the desktop matches on it and retires the shot
instead of retrying it on every pass forever.

**Naming.** The desktop already has an unrelated `local_only` flag meaning
"personal mode, no backend account at all". This feature is deliberately named
differently (`upload_screenshots` locally, `screenshot_upload` in the policy/DB)
to avoid conflating the two. The desktop toggle is hidden in personal mode, where
there is no server to upload to.

## Implementation

**Backend**
- Migration `00010_screenshot_upload.sql`: `businesses.screenshot_upload boolean
  NOT NULL DEFAULT true` (existing orgs keep uploading — no behaviour change).
- `store/owner.go`: column in `businessCols`/`Business`/`CapturePolicy`, added to
  `settableColumns`, returned by `PolicyForUser`; new `ScreenshotUploadAllowed`.
- `handlers/owner.go`: boolean validation on PATCH `/v1/businesses/:id/settings`
  (shared with `allow_employee_override`), exposed on `GET /v1/policy`.
- `handlers/screenshot.go`: `POST /v1/sync/screenshots` returns **403** with code
  `screenshot_upload_disabled` when the org forbids it. Checked *after* business
  resolution but *before* the file is written, so a rejected shot leaves nothing
  on disk.

**Desktop**
- `settings`: new `upload_screenshots: bool`, default `true`.
- `sync/client.rs`: `screenshot_upload` on the fetched `Policy`.
- `commands`: applied by `apply_org_policy` when the policy is locked, and added
  to the `set_settings` clobber list so a locked org policy is enforced in Rust,
  not just hidden in the UI.
- `storage`: `retire_pending_screenshots()` clears the pending flag on unsent
  shots, leaving rows and files intact for the local gallery until retention
  prunes them.
- `sync/worker.rs`: skips the screenshot upload block when upload is off and
  retires whatever is pending; also retires on a `screenshot_upload_disabled`
  rejection from the server.
- `screens/Settings.tsx`: "Upload screenshots" switch under Screenshots, hidden
  in personal mode. Strings added to all 7 locales.

**web-admin**
- `Business` / `BusinessSettingsPatch` types + demo fixture.
- Settings → Capture policy: an **Upload / Local only** segmented control,
  placed above Screenshot mode. Strings added to all 7 locales.

## Verification

- `go build ./...`, `go test ./...` — pass.
- `cargo check`, `cargo test` — 28 pass, including a new
  `retire_pending_screenshots_keeps_rows_but_clears_the_upload_queue` test
  asserting the backlog is never resurrected when upload is re-enabled.
- desktop + web-admin `tsc --noEmit` and `vite build` — pass.
- End-to-end against a local backend on the dev DB:
  1. migration applies (`goose: successfully migrated database to version: 10`),
     column defaults to `true`;
  2. upload succeeds while allowed (200, `accepted`);
  3. owner PATCHes `screenshot_upload=false` → `GET /v1/policy` reflects it;
  4. the same upload is refused **403 `screenshot_upload_disabled`**, and no
     file is written to the storage dir;
  5. a non-boolean value is rejected by validation;
  6. switching it back on lets uploads through again (200).

## Follow-ups / notes

- **Pre-existing gap (not fixed here):** `capture_screenshots` and
  `count_keystrokes` are *not* in the `set_settings` clobber list, so a locked
  org policy only hides those two in the UI — it doesn't enforce them in Rust.
  The new `upload_screenshots` field *is* clobbered. Worth closing separately.
- The owner dashboard shows no screenshots for a member in local-only mode; a
  hint explaining *why* (rather than an empty state that reads as broken) would
  be a nice follow-up.
- Manual QA: flip the org setting, confirm the desktop picks it up on next focus
  /login, confirm the local gallery still fills while the dashboard stays empty.
