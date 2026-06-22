# 134 — Fix: `app_active` never fired (move to native window focus)

**Status:** Done (ships in 1.3.7)
**Type:** Bugfix (follow-up to [133](133-analytics-app-active-ui-click-events.md))

## Symptom
After 1.3.6 shipped the new analytics events, **no `app_active` events** showed up.

## Investigation (on the 1.3.6 release build)
Reproduced locally with the built `.app`, watching the analytics log (`flushed … [event] ->
200 OK`, event name added to the log for this):
- `app_started` → **200 OK** ✓ (Rust, on launch)
- `ui_click` → **200 OK** ✓ (confirmed firing on a real button click)
- `app_active` → **never fired** ✗ — across window re-focus (System Events), real
  title-bar click, and hide/show cycles.

**Root cause:** `app_active` was wired to the DOM `window` `focus` (and `onFocusChanged`)
event in the webview. In a Tauri webview those do **not** fire on *native* window
activation (cmd-tab / dock / re-open). So the event was effectively dead. (The app's other
focus-driven refresh has the same latent limitation.)

## Fix
- Emit `app_active` **natively in Rust** from `WindowEvent::Focused(true)` in `lib.rs` (the
  existing `on_window_event` handler), throttled to ≥30 s via an `AtomicI64`. This is the
  dependable signal and fires for real activations. Verified: log now shows
  `[app_active] -> 200 OK` on focus.
- Removed the dead JS `app_active`/`onFocusChanged` path from `App.tsx`; **`ui_click`
  stays** in JS (DOM clicks work fine).
- Added the event name to the analytics success log (`flushed N [event] -> …`) to make this
  class of issue debuggable from the app log going forward.

## Notes for verifying in Aptabase
- Release builds send `isDebug=false` → events land in the **production** dashboard, not the
  **Debug/Live** view (which only shows `isDebug=true` dev runs).
- Events only flow from a client actually running **1.3.7+** (check the version shown under
  the sidebar brand / Settings).

## Verify
- `cargo check` + `tsc --noEmit` clean.
- Built `.app`: log shows `app_started`, `app_active`, and `ui_click` all `-> 200 OK`.
- Shipped via the signed auto-update pipeline as **1.3.7**.
