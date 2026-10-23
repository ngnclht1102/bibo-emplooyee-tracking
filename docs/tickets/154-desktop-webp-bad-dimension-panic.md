# 154 — Desktop: panic `VP8_ENC_ERROR_BAD_DIMENSION` encoding a screenshot (CTR-4)

**Sentry:** DESKTOP-RUST-9 — `panic: called 'Result::unwrap()' on an 'Err' value: VP8_ENC_ERROR_BAD_DIMENSION` (1 event/24h, release ctracking@1.5.5, Windows). https://asa-sq.sentry.io/issues/7671445743/

## Cause
`compress_to_webp` (`apps/desktop/src-tauri/src/trackers/mod.rs`) encoded screenshots
with `webp::Encoder::encode(q)`, which **unwraps internally** — any libwebp encoder
error panics the whole app. `VP8_ENC_ERROR_BAD_DIMENSION` means width or height was 0
(or > 16383, impossible here after downscaling): on Windows a transient/zero-sized
window capture (e.g. a window mid-close or cloaked) can come back 0×N, and the
active-window screenshot path fed it straight to the encoder.

## Fix
- Guard: a zero-sized capture is logged and skipped before encoding.
- `encode(q)` → `encode_simple(false, q)`, which returns a `Result`; an encoder error
  logs a warning and moves on to the next quality/size candidate instead of panicking.
- `compress_to_webp` now returns `Option<...>`; on `None` the callers skip that shot
  (active-window path falls back to the full-screen shot, per-monitor loop continues).
- Regression test: `zero_sized_capture_is_skipped_not_panicking` (0×0 and 0×500).

Hotfix on `release/v1.6.0`, merged to `staging`.

## Verify
- `cargo check` clean; `cargo test --lib trackers::` all pass (incl. the new test).
