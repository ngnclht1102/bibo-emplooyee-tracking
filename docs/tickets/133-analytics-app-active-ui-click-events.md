# 133 — Analytics: `app_active` + `ui_click` events

**Status:** Done (ships in 1.3.6)
**Type:** Implementation

## Goal
Send more product-usage signal to Aptabase beyond launch (`app_started`, ticket 128/129):
1. **`app_active`** — the user switched back to the app (window came to the foreground).
2. **`ui_click`** — the user clicked a menu (sidebar nav) item or a button.

## Changes

### Rust — generic event sender (`src-tauri/src/analytics.rs`)
- `build_event` generalized: takes `event_name` + optional `props` (Aptabase `props`
  object), instead of hardcoding `app_started`.
- New public `track_event(event_name, locale, device_id, queue_dir, props)` holds the
  send/queue logic; `track_app_started` is now a thin wrapper over it. **Same pipeline as
  before** — stable per-device session, batch endpoint, offline retry queue.

### Rust — command (`src-tauri/src/commands/mod.rs`, registered in `lib.rs`)
- `track_event(name, props?)` Tauri command. Reads `device_id` + `locale` from
  `SettingsState` and resolves the queue dir from `app_data_dir()` — no new managed state.
  Fire-and-forget; never fails the caller.

### Frontend (`src/analytics.ts`, wired in `src/App.tsx`)
- `track(name, props?)` helper → invokes the command.
- `app_active`: fires on `window` focus / `visibilitychange`, **throttled to ≥30 s apart**
  so rapid alt-tabbing doesn't spam.
- `ui_click`: one **delegated** capture-phase listener on `document` matches
  `button, .nav-item`, labels the event by the element's `aria-label`/text (≤40 chars) and
  includes the current `screen`. Covers every button + nav item without touching each
  component.

## Notes / trade-offs
- Each event is its own fire-and-forget POST (failures batch via the offline queue). Volume
  for this app's UI is low; if click volume ever grows, add a short Rust-side buffer/flush.
- Labels come from visible button text only — no user data (emails etc. live in non-button
  elements).
- New events accrue from **1.3.6 forward**; takes effect once users are on 1.3.6+.

## Verify
- `tsc --noEmit` + `cargo check` clean.
- `app_started` still posts `200 OK` on launch (same path); shipped via the signed
  auto-update pipeline as **1.3.6**.
