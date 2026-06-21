# 120 — Extension rebrand → "BiBo Tracker" (display only)

**Status:** Done
**Type:** Implementation

## Goal
Rename the Chrome/Edge extension's **display** name to **"BiBo Tracker"**. Display
only — internal build/infra identifiers (`@ctracking/extension`, `employeetrack`,
`x-ctracking-token`, the `/whoami` `app: "employeetrack"` handshake) stay untouched, and
the other apps keep "BiBoTracking". Mirrors the spirit of task 111.

## Changes
- `apps/extension/manifest.json`
  - `name` → `"BiBo Tracker"`
  - `action.default_title` → `"BiBo Tracker"`
  - `description` → "Reports the active browser tab (URL + time on page) to the local
    **BiBo Tracker** app."
- `apps/extension/popup.html` — brand heading (line ~75) → `"BiBo Tracker"`.
- `apps/extension/package.json` — `description` text mention only (keep `name`
  `@ctracking/extension`).
- `apps/extension/STORE_LISTING.md` — listing title/body → "BiBo Tracker".

## Out of scope / do NOT change
- `/whoami` handshake value `"app": "employeetrack"` (extension ↔ desktop contract).
- `x-ctracking-token` header, candidate ports, package `name`.
- Any other app's brand (web-admin / desktop / marketing stay "BiBoTracking").

## Verify
- Load unpacked extension in Chrome → toolbar tooltip + popup heading read "BiBo Tracker".
- Extension still discovers the desktop app and posts visits (handshake unchanged):
  desktop **Browser** screen shows new visits.
