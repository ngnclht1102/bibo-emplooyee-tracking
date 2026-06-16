# 36 — QA: backend scaffold

- **Phase:** 5
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 35

## Checks
- [ ] `docker-compose up` starts backend + Postgres cleanly.
- [ ] `curl /healthz` → 200 with version.
- [ ] Stop Postgres → backend reports a clear connection error, doesn't hang.
- [ ] Migrations table exists; re-running startup is a no-op.
