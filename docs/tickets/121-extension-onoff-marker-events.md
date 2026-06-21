# 121 — Extension on/off → marker browser-page events

**Status:** Done
**Type:** Implementation

## Goal
When the user toggles the extension's "Track this browser" switch, emit a special
browser-page event so the off/on transition is visible in the owner dashboard. The
event flows the normal path (extension → local desktop `/ingest` → desktop sync →
backend `browser_visits`) using a reserved URL value:
- **turn OFF** → `url: "user_turn_off_in_browser"`
- **turn ON**  → `url: "user_turn_on_in_browser"`

## Design
The toggle lives in `popup.js` (writes `chrome.storage.local.paused`), but port/token
discovery + posting live in `background.js`. Drive the marker from the **background**
service worker so discovery is reused.

### Extension (`apps/extension/background.js`)
- Add `chrome.storage.onChanged` listener for key `paused`:
  - On change, build a marker visit and `postVisit()` it:
    ```js
    {
      url: newPaused ? "user_turn_off_in_browser" : "user_turn_on_in_browser",
      page_title: newPaused ? "Tracking turned off in browser"
                            : "Tracking turned on in browser",
      ts: now(),
      browser: BROWSER,
      duration_s: 0,
    }
    ```
  - Reuse existing `postVisit()` (handles discovery, token, 401/404 re-discover).
- Edge case: when turning **off**, post the OFF marker *before* the popup stops further
  tracking — since the marker is posted from the storage listener (fires on the new
  value), post it immediately regardless of the new paused value (markers are control
  events, not page views).

### Desktop (`apps/desktop/src-tauri/src/server/mod.rs`, `ingest` handler)
- `ingest` currently returns `200` **without recording** when `control.paused` is set.
  Add a marker bypass: if `v.url` is one of the two reserved markers, **record it even
  when paused** (so an OFF event still lands). Treat markers as exempt from
  `domain_only` rewriting too (don't run `origin_only` on them).
- Reserved values centralized as consts:
  `const MARKER_OFF = "user_turn_off_in_browser";`
  `const MARKER_ON  = "user_turn_on_in_browser";`

### Backend
- **No change** — `browser_visits.url` is free text; markers upsert and sync like any
  visit. Reporting (`GET /v1/reports/employees/:id/browser`) returns them as-is.

## Out of scope
- Special rendering/labeling of markers in the dashboard UI (could be a later polish
  ticket). Markers will simply appear as browser rows with the reserved URL.

## Verify
- Run desktop dev + load extension; open popup, toggle OFF then ON.
- Desktop **Browser** screen shows two rows with urls `user_turn_off_in_browser` /
  `user_turn_on_in_browser` (duration 0). Confirm the OFF row appears even though
  tracking is paused.
- After a sync cycle, backend `browser_visits` has both rows
  (`select url from browser_visits order by id desc limit 2;`).
