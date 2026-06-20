# 63 — Web admin: reporting dashboards

- **Phase:** 5
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** 45, 59
- **Blocks:** —

## Goal
Owner dashboards over the reporting APIs (task 45), styled per
[docs/07-ui-design.md](../07-ui-design.md).

## Scope
- Employee roster with last-seen + active time today.
- Per-employee view with date-range picker:
  - app-usage timeline + breakdown (tone/opacity, not rainbow),
  - keystroke chart (counts only — privacy caption),
  - browser visit table,
  - screenshot gallery grid (thumbnails via the auth-gated image endpoint; click to enlarge).
- Reuse dashboard component styles from the desktop app where practical.

## Acceptance criteria
- [ ] Roster shows synced employees with accurate last-seen/active time.
- [ ] Timeline, breakdown, keystrokes, browser, screenshots all render real synced data.
- [ ] Date-range filter updates every panel.
- [ ] Screenshot thumbnails load via the authorized endpoint; enlarge works.
- [ ] Flat/token theme in dark + light.
