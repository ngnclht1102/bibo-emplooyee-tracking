# 153 — Desktop (Windows): panic `assertion failed: flush_paint_messages(...)` (CTR-3)

**Sentry:** DESKTOP-RUST-1C — `panic: assertion failed: flush_paint_messages(None, &subclass_input.event_loop_runner)` (1 event/24h, release ctracking@1.5.5). https://asa-sq.sentry.io/issues/7797517144/

## Cause
Upstream bug in **tao** (Tauri's winit fork), not our code — tracked as
[tauri-apps/tao#1140](https://github.com/tauri-apps/tao/issues/1140). On Windows, tao's
WM_PAINT handler for the thread event target asserts that `flush_paint_messages` is never
re-entered. In rare nested win32 modal loops (reported triggers: Bluetooth device
changes, closing the Windows Bluetooth settings window, VPN switches) it *is* re-entered
and the assert crashes the whole app.

Upstream closed #1140 as "should be fixed by tray-icon ≥ 0.21.2" (reverting the main
trigger, tray-icon#268) — but 1.5.5 already shipped tray-icon 0.23.1 and still crashed,
and the assert is still present in the latest tao (0.37.2 as of 2026-10-23). The tao
maintainer (FabianLars) himself suggested replacing the assert with a log.

## Fix
Patched tao 0.35.3 with exactly that: the assert becomes a conditional — if the flush is
re-entered, skip `redraw_events_cleared` (the outer invocation finishes it) and
`log::warn!` instead of panicking. Same handling the sibling WM_PAINT call site
(`managing_redraw`) already uses.

- Fork: `ngnclht1102/tao`, branch `bibo-v0.35.3-no-flush-assert`, rev `7c96f9b`
  (one commit on top of tag `tao-v0.35.3`).
- Wired in via `[patch.crates-io]` in `apps/desktop/src-tauri/Cargo.toml`.
- Drop the patch when upstream removes the assert.

## Verify
- `cargo check` (macOS) on the app with the patch resolved.
- `cargo check --target x86_64-pc-windows-msvc` on the patched tao itself (the changed
  code is Windows-only).

## Status
- Hotfixed on `release/v1.6.0`, merged to `staging`.
