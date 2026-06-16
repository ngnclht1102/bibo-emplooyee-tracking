# 50 — QA: local migration v2

- **Phase:** 5
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 49

## Checks
- [ ] Open an existing v1 DB → upgrades cleanly, rows keep data, get uuids.
- [ ] New rows have unique client_uuid + synced=0.
- [ ] Add keystrokes to a synced bucket → flips to synced=0.
- [ ] device_id stays the same after restart.
