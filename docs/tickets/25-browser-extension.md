# 25 — Browser extension (tab tracking + port auto-discovery)

- **Phase:** 3
- **Type:** Implementation
- **Status:** Blocked
- **Blocked by:** 23
- **Blocks:** 26, 27

## Goal
A Manifest V3 extension (Chrome/Edge) that reports active-tab visits to the local
app, per [docs/04-browser-extension.md](../04-browser-extension.md).

## Scope
- MV3 service worker listening to `tabs.onActivated`, `tabs.onUpdated`,
  `windows.onFocusChanged`.
- Track active tab + timestamp; on change, compute `duration_s` for the previous
  page and `POST /ingest` `{ url, page_title, ts, browser, duration_s }`.
- Only count time while the browser window is focused.
- **Port auto-discovery:** probe the candidate list via `GET /whoami`, verify the
  app signature, cache the port; re-discover on send failure.
- Send the shared `X-Token` on every post. Minimal permissions (`tabs`, host).

## Acceptance criteria
- [ ] Switching tabs/pages posts visits with correct URL, title, and duration.
- [ ] Background/unfocused time is not counted.
- [ ] Extension finds the app's port automatically, even after the app changes port.
- [ ] Re-discovers and recovers if the app restarts or was closed.
- [ ] Loads as an unpacked extension in Chrome and Edge.
