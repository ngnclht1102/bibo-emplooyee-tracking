# 54 — QA: sync worker end-to-end

- **Phase:** 5
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 53

## Checks
- [ ] Generate activity offline → rows pending; reconnect → they sync and flip synced=1.
- [ ] Backend shows the data (cross-check with reporting APIs).
- [ ] Kill app mid-sync → restart → no duplicates on backend, all rows end synced.
- [ ] Stop backend → worker backs off, no crash; restart backend → catches up.
- [ ] Screenshots appear on backend; local copies remain until retention.
