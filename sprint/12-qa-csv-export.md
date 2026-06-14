# 12 — QA: CSV export

- **Phase:** 1
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 11
- **Blocks:** —

## Goal
Confirm export produces correct, openable files and nothing leaks automatically.

## Interactive checklist
- [ ] Trigger export, choose a location via the save dialog — files are written.
- [ ] Open each CSV in Numbers/Excel — headers + rows correct, no broken columns.
- [ ] A row with quotes/commas/emoji in the title or URL is escaped correctly.
- [ ] Row counts roughly match what's in the DB.
- [ ] Confirm nothing is sent anywhere except this explicit export (no network calls).

## Pass condition
All boxes checked. Any failure → reopen task 11.
