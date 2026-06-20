# 69 — M2: Windows keyboard counter (WH_KEYBOARD_LL)

- **Phase:** 6
- **Type:** Implementation
- **Status:** Blocked
- **Blocked by:** 68
- **Blocks:** 70

> Plan: [docs/12-windows-support-plan.md](../12-windows-support-plan.md) §3 workstream A (**High risk**), §8.
> macOS reference: task 17 + [platform/macos.rs](../../apps/desktop/src-tauri/src/platform/macos.rs) `keytap`.

## Goal
Count keypresses on Windows into `keystroke_bucket`, with the exact same privacy
guarantee as macOS: **only count key-down events; never decode or store which key.**
Replaces the `run_keyboard_tap()` stub in
[platform/windows.rs](../../apps/desktop/src-tauri/src/platform/windows.rs).

## Scope
- Implement `run_keyboard_tap() -> bool` for Windows using a **low-level keyboard hook**:
  - `SetWindowsHookExW(WH_KEYBOARD_LL, proc, hmod, 0)` on a **dedicated thread** that
    owns a message loop (`GetMessageW`/`TranslateMessage`/`DispatchMessageW`) — the hook
    only fires while a message loop is pumping on that thread.
  - In the hook proc, increment `super::KEY_PRESS_COUNT` **only** for `WM_KEYDOWN` and
    `WM_SYSKEYDOWN`. Ignore key-up/repeat-down semantics to match macOS (count each
    `WM_KEYDOWN`). Do **not** read `vkCode`/`scanCode` for anything but the count.
  - Always call `CallNextHookEx` and return its result.
  - Return `false` if the hook can't be installed so the caller's retry loop idles
    (mirrors the macOS "permission missing" path); the trackers loop already retries
    ([trackers/mod.rs](../../apps/desktop/src-tauri/src/trackers/mod.rs) `start_keyboard`).
- Add the `windows` crate features needed: `Win32_UI_WindowsAndMessaging` (hooks +
  message loop), plus existing `Win32_Foundation`. Update
  [Cargo.toml](../../apps/desktop/src-tauri/Cargo.toml) Windows target deps.
- **Fallback (document, implement only if the hook is blocked):** Raw Input
  (`RegisterRawInputDevices` + `WM_INPUT`) on a hidden message-only window. Capture the
  degradation in §8: a `WH_KEYBOARD_LL` hook cannot observe input routed to a
  higher-integrity/elevated foreground app — degrade gracefully, never crash.
- The flusher (`KEY_FLUSH` → per-minute bucket, pause-aware) is platform-agnostic and
  already in `trackers/mod.rs` — no change needed.

## Acceptance criteria
- [ ] Typing anywhere (global) increments `keystroke_bucket` counts; counts persist.
- [ ] **No key codes / characters** are written to disk or logs — verify in code, DB,
      and stdout/stderr.
- [ ] Bucket upsert stays idempotent (unchanged flusher).
- [ ] Counting is paused when paused via tray/Settings (existing `paused` check).
- [ ] Hook install failure (or a window it can't observe) does not crash; retry loop
      keeps the app alive. Degradation noted in the tracker/plan.
- [ ] `cargo check`/build clean on Windows **and** macOS (cfg-gated; macOS untouched).
