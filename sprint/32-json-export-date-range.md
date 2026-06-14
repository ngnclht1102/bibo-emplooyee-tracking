# 32 — JSON export + date-range filters

- **Phase:** 4
- **Type:** Implementation
- **Status:** Blocked
- **Blocked by:** 11
- **Blocks:** 33

## Goal
Round out export: JSON output and date-range filtering for both CSV and JSON.

## Scope
- JSON export: a single document covering all tables (or per-table arrays).
- Date-range picker applied to both CSV and JSON exports.
- Reuse the export plumbing from task 11; native save dialog.

## Acceptance criteria
- [ ] JSON export produces valid, well-formed output covering all tables.
- [ ] Date-range filter limits exported rows correctly for both formats.
- [ ] Still user-triggered only; no automatic egress.
- [ ] Large exports complete without freezing the UI.
