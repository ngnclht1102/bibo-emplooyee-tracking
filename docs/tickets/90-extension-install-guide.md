# 90 — Browser extension install guide

- **Phase:** 7
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** 83
- **Blocks:** 91

## Goal
Guide users to install the Chrome extension from the desktop Browser screen
(mockup **B1**), shown until the extension pairs.

```
   Install the BiBoEmployeeTracking extension to track web pages.
   ┌ [ GIF placeholder ] ┐  1. Open Chrome
   │ install walkthrough │  2. Chrome Web Store → [ Get the extension → ]
   └─────────────────────┘  3. "Add to Chrome"   4. Come back — auto-connects
   Status: ▲ Waiting for the extension…  (auto-detect via /whoami)
   Supported: ✓ Chrome    Coming soon: Edge · Firefox · Safari
```

## Scope
- In the desktop **Browser** screen, when the extension isn't paired/seen (reuse the
  existing `/whoami` / connection state), render the install guide: download / Web
  Store CTA, numbered steps, a **GIF placeholder slot**, a live status line
  (`Waiting…` → `Connected`), and "Coming soon: Edge · Firefox · Safari".
- Auto-replace the guide with the normal browser-activity table once paired.
- Optional: a condensed mirror of the guide in web-admin.

## Acceptance criteria
- [ ] With no extension, the Browser screen shows the guide + placeholder + steps.
- [ ] Status reflects live connection state and flips to "Connected" on pairing.
- [ ] After pairing, the guide is replaced by the activity table.
- [ ] "Coming soon" browsers listed; only Chrome marked supported.
