# 24 — QA: ingest server

- **Phase:** 3
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 23
- **Blocks:** —

## Goal
Confirm the local server behaves and is safe, using manual requests.

## Interactive checklist
- [ ] `curl http://127.0.0.1:<port>/whoami` returns the app signature.
- [ ] `POST /ingest` with the valid token inserts a `browser_visit` row.
- [ ] `POST /ingest` with no/wrong token is rejected (401/403).
- [ ] Occupy the first candidate port (e.g. `nc -l`), relaunch — app falls back to
      the next port; Settings shows the active one.
- [ ] A request with a foreign `Origin` is blocked.
- [ ] From another device on the LAN, the port is unreachable.

## Pass condition
All boxes checked. Any failure → reopen task 23.
