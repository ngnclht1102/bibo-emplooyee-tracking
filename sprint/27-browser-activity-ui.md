# 27 — Browser activity UI

- **Phase:** 3
- **Type:** Implementation
- **Status:** Blocked
- **Blocked by:** 3, 23, 25
- **Blocks:** 28

## Goal
Show browser visits in the dashboard, per the design prompt.

## Scope
- **Browser screen:** table of visits (page title, domain/URL, time spent,
  timestamp), sortable.
- Summary above the table: top sites by time with thin % bars (same style as the app
  breakdown).
- Tauri commands to query `browser_visit` by day / range.
- Respect privacy setting: show domain-only when that mode is on (see task 30).

## Acceptance criteria
- [ ] Table reflects real `browser_visit` data; sorting works.
- [ ] Top-sites summary aggregates time correctly.
- [ ] Domain-only mode hides full URLs when enabled.
- [ ] Correct in dark + light; tokens only.
