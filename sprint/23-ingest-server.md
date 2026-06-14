# 23 — Local ingest server + port fallback

- **Phase:** 3
- **Type:** Implementation
- **Status:** Blocked
- **Blocked by:** 5
- **Blocks:** 24, 25, 27

## Goal
A loopback HTTP server that receives browser-tab data, with the candidate-port
fallback + discovery handshake from
[docs/04-browser-extension.md](../docs/04-browser-extension.md).

## Scope
- `axum` on `127.0.0.1` only. Bind the first free candidate port from the shared
  list `[47615, 48291, 49377, 50603, 51719, 52837]`; auto-fallback if taken.
- `GET /whoami` — unauthenticated identity handshake:
  `{ "app": "ctracking", "version": "...", "wants": "X-Token" }`.
- `POST /ingest` — token-protected (`X-Token`), Origin/CORS-checked; validate payload
  and insert into `browser_visit`.
- Generate/store the shared token; show the active port in Settings → Browser.

## Acceptance criteria
- [ ] Server binds the first free candidate; if one is busy, it uses the next.
- [ ] `GET /whoami` returns the app signature.
- [ ] `POST /ingest` with valid token inserts a `browser_visit` row.
- [ ] `POST /ingest` without/with wrong token is rejected; cross-origin posts blocked.
- [ ] Not reachable from another machine on the LAN (loopback only).
