# 19 — Screenshot capture

- **Phase:** 2
- **Type:** Implementation
- **Status:** Blocked
- **Blocked by:** 5, 13
- **Blocks:** 20, 21, 29

## Goal
Capture periodic screenshots to disk and record metadata in `screenshot`, per
[docs/01-architecture.md](../01-architecture.md) and the compatibility doc.

## Scope
- `ScreenshotTaker` on a timer (default every 5–10 min; configurable later).
- Capture each display via `xcap` (ScreenCaptureKit on modern macOS — verify on
  macOS 26). Requires Screen Recording (gated by task 13).
- Save PNGs under the app support dir; write `ts`, `file_path`, `display_id`,
  `width`, `height` to the DB.
- Optional downscale to limit size (full-res ok for v1).
- Multi-display handling. Pause cleanly if permission missing/revoked.

## Acceptance criteria
- [ ] Screenshots are captured on schedule and saved to disk.
- [ ] DB rows reference the correct files with correct metadata.
- [ ] Capture works on macOS 26 specifically (no legacy-API breakage/black frames).
- [ ] Multi-display setups capture each display.
- [ ] Without permission, capture pauses (no crash); resumes when granted.
