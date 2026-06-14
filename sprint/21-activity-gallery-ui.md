# 21 — Activity & gallery UI (keyboard chart + screenshot gallery)

- **Phase:** 2
- **Type:** Implementation
- **Status:** Blocked
- **Blocked by:** 3, 17, 19
- **Blocks:** 22

## Goal
Surface keyboard activity and screenshots in the UI.

## Scope
- **Activity screen:** bar/area chart of keypress counts over the day (single hue,
  flat). Privacy caption: "Counts only — actual keys are never recorded." Optional
  idle-vs-active strip aligned to the timeline.
- **Screenshots screen:** thumbnail grid grouped by time; timestamp on hover; click
  → larger preview; date filter at top.
- Tauri commands to query `keystroke_bucket` and `screenshot` by day.
- Lazy-load thumbnails so the grid stays responsive.

## Acceptance criteria
- [ ] Keyboard chart reflects real bucket data; privacy caption present.
- [ ] Gallery shows real screenshots with correct timestamps; preview works.
- [ ] Date filter narrows both views.
- [ ] Correct in dark + light; tokens only; grid stays smooth with many images.
