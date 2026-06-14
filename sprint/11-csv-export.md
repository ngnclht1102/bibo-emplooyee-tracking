# 11 — CSV export

- **Phase:** 1
- **Type:** Implementation
- **Status:** Blocked
- **Blocked by:** 5
- **Blocks:** 12, 30, 32

## Goal
Export local data to CSV — the only path by which data leaves the machine.

## Scope
- Tauri command to export, with a native save dialog for the destination.
- One CSV per table (or a zip): `activity_sample`, `keystroke_bucket`,
  `screenshot` (metadata + path), `browser_visit`.
- Optional date-range filter (full range for now; richer filters in task 32).
- UTF-8, proper escaping/quoting, header row.

## Acceptance criteria
- [ ] Export produces valid CSVs that open cleanly in a spreadsheet.
- [ ] All available tables are represented; columns match the schema.
- [ ] Special characters in titles/URLs are escaped correctly.
- [ ] Export is user-triggered (no automatic egress anywhere).
