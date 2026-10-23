# 152 — Extension: stop reporting expected "No tab with id" to Sentry (CTR-2)

**Sentry:** DESKTOP-RUST-5 — `No tab with id: <id>.` (602 events, 32 users/30d, all releases up to 1.6.x). https://asa-sq.sentry.io/issues/7599389887/

## Cause
In `apps/extension/background.js`, the `chrome.tabs.onActivated` handler wrapped both
`chrome.tabs.get(tabId)` and `transition()` in one try/catch. `chrome.tabs.get` rejects
with `No tab with id: X` when the tab closes between activation and the lookup — an
expected race, as the comment already said — but the catch forwarded it to Sentry via
`/report-error` anyway (`extra.context = "onActivated"` on every event).

## Fix
Split the try/catch: a `chrome.tabs.get` rejection returns silently; only a real
`transition()` failure is still reported.

## Status
- Hotfixed on `release/v1.6.0`, merged to `staging`.
