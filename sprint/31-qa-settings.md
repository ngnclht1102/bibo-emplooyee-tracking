# 31 — QA: settings

- **Phase:** 4
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 30
- **Blocks:** —

## Goal
Confirm every setting persists and actually changes behavior.

## Interactive checklist
- [ ] Change theme — applies immediately; persists after restart.
- [ ] Change idle threshold — active-time counting reflects the new value.
- [ ] Change screenshot interval — capture cadence changes.
- [ ] Set retention caps low — cleanup prunes accordingly.
- [ ] Enable domain-only / add a deny-list entry — browser data respects it.
- [ ] Settings → Permissions opens the permissions screen.
- [ ] Active ingest port + token status shown correctly.
- [ ] Export buttons work (cross-check with tasks 12 / 32).

## Pass condition
All boxes checked. Any failure → reopen task 30.
