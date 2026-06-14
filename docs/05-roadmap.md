# Roadmap

Phased to front-load the easy wins and defer the permission-heavy parts.

## Phase 1 — Core skeleton (start here)

- Scaffold Tauri v2 + React + Vite + TypeScript.
- **Design foundation:** `theme.css` with the semantic tokens + dark/light/system
  switching from the start — see [07-ui-design.md](07-ui-design.md).
- SQLite layer (`rusqlite`) + schema migrations.
- `ActiveWindowTracker` (app name + window title + interval coalescing).
- Dashboard: today's app-usage timeline + breakdown.
- CSV export.

**Outcome:** a running app that shows your own application usage for today.
Only needs Accessibility (for titles); app name works with no permission.

## Phase 2 — Keyboard + screenshots

- `KeyboardCounter` via `rdev` (counts only, per N-minute bucket).
- `ScreenshotTaker` via `xcap` on a timer.
- **Permissions onboarding screen** (Accessibility, Input Monitoring, Screen
  Recording) — see [03-macos-permissions.md](03-macos-permissions.md).
- Screenshot gallery + keyboard-activity chart in the UI.

## Phase 3 — Browser extension

- Manifest V3 extension (Chrome/Edge) reporting active tab.
- `axum` local ingest server on `127.0.0.1` with a shared token.
- Per-page timing + browser visit list in the UI.
- See [04-browser-extension.md](04-browser-extension.md).

## Phase 4 — Polish

- Screenshot retention/cleanup job (size + age caps).
- Settings: capture intervals, pause/resume, domain-only URL mode, deny lists.
- Nicer exports (JSON, zipped CSVs, date-range filters).
- Code-signing + notarization for distribution.

## Tracking

| Phase | Status |
|---|---|
| 1 — Core skeleton | not started |
| 2 — Keyboard + screenshots | not started |
| 3 — Browser extension | not started |
| 4 — Polish | not started |
