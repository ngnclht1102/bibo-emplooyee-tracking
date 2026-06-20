# 68 — M1: Windows platform abstraction + skeleton

- **Phase:** 6
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** —
- **Blocks:** 69, 71, 74

> Plan: [docs/12-windows-support-plan.md](../12-windows-support-plan.md) §2, §3 (B,D,G,H).
> Tracker: [docs/13-windows-support-ticket.md](../13-windows-support-ticket.md).

## Goal
Make the Tauri desktop crate compile **and run** on Windows 10/11 (x64) without
changing macOS behavior. The repo would not compile for Windows until the macOS-only
platform layer was abstracted — this is the unblocker for all other Windows work.

## Scope (done)
- **Platform split** ([apps/desktop/src-tauri/src/platform/](../../apps/desktop/src-tauri/src/platform/)):
  - `mod.rs` — the OS-agnostic interface: shared types (`PermissionState`, `Permission`,
    `ActiveWindowInfo`, `KEY_PRESS_COUNT`), the cross-platform `active_window()`
    (via `active-win-pos-rs`), and `#[cfg]` `pub use` of the active backend.
  - `macos.rs` — all prior macOS code (`#[cfg(target_os = "macos")]`): TCC permission
    checks, System Settings deep links, CGEventTap key-down counter, idle via
    `CGEventSourceSecondsSinceLastEventType`.
  - `windows.rs` — new (`#[cfg(target_os = "windows")]`): idle via `GetLastInputInfo`
    (real, workstream B); permissions report `Granted` / requests are no-ops; keyboard
    counter stubbed (returns `false`) pending task 69.
- **Cargo deps cfg-gated** ([Cargo.toml](../../apps/desktop/src-tauri/Cargo.toml)):
  `core-foundation` moved under `[target.'cfg(target_os = "macos")'.dependencies]`;
  added `[target.'cfg(target_os = "windows")'.dependencies] windows = "0.58"` with
  `Win32_Foundation`, `Win32_System_SystemInformation`, `Win32_UI_Input_KeyboardAndMouse`.
- **Token-gen fix** (workstream G, [server/mod.rs](../../apps/desktop/src-tauri/src/server/mod.rs)):
  `gen_token()` now uses the cross-platform `getrandom` CSPRNG instead of reading
  `/dev/urandom` (which silently produced all-zeros on Windows).
- **File perms** (workstream H): `sync/auth.rs` chmod is already `#[cfg(unix)]`-gated —
  no-op on Windows, no change needed.

## Acceptance criteria
- [x] `cargo check` clean on macOS (no behavior change).
- [x] `cargo check` clean on Windows (MSVC) on the `winbuild` PC.
- [x] `tauri build --debug` produces a runnable `ctracking.exe`.
- [x] Launches on Windows: WebView2 UI renders, axum ingest server listens, `whoami`
      returns app/version + a **real random** token (proves `getrandom`).
- [x] Active window + idle read correctly on Windows (cross-platform / `GetLastInputInfo`).

## Out of scope (moved to later tasks)
- Data-driven `permissions_status()` Vec + per-OS React rows → **task 71/72** (was listed
  under M1 in the plan; split out to keep M1 = "compiles & runs").
- Keyboard counting on Windows → **task 69**.
- Screenshot multi-monitor / mixed-DPI validation (workstream C) → **task 79**.
- `apply_dock_policy` → taskbar-button mapping (workstream F) → **task 72** (optional).

## Notes for the next agent
- The build PC is reachable as `ssh winbuild` (Win10 Pro, MSVC + Win SDK 10.0.26100,
  Rust 1.96, Node 24 / pnpm, WebView2). See the §5.2 log in the tracker.
- GUI apps launched over plain SSH don't surface on the console; launch via an
  interactive scheduled task (`schtasks /it`) to see the window in Parsec.
