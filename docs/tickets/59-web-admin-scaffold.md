# 59 — Web admin scaffold

- **Phase:** 5
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** 37
- **Blocks:** 61, 63

## Goal
`apps/web-admin` React + Vite SPA shell with auth, per
[docs/11-backend-and-sync.md](../11-backend-and-sync.md) and the design tokens in
[docs/07-ui-design.md](../07-ui-design.md).

## Scope
- `apps/web-admin` (Vite + React + TS) in the pnpm workspace; reuse
  `@ctracking/design` tokens (dark/light/system).
- Login page (owner) hitting `/v1/auth/login`; token stored in memory + refresh flow.
- Authenticated app shell: sidebar nav (Dashboard, Employees, Settings), protected routes.
- API client with Bearer auth + auto-refresh.
- Dev: Vite proxy to backend; prod: built static files served by the backend.

## Acceptance criteria
- [ ] `pnpm --filter @ctracking/web-admin dev` runs; login works against the backend.
- [ ] Unauthenticated routes redirect to login; refresh keeps the session.
- [ ] Theme tokens applied (dark + light).
- [ ] Production build is served by the Go backend as static files.
