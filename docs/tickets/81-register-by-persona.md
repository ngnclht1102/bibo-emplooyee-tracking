# 81 — Register + business setup by persona (backend)

- **Phase:** 7
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** 80
- **Blocks:** 82, 85

## Goal
Carry persona end-to-end through signup so the right business `kind` and labels
follow. See [docs/14-signup-and-onboarding.md](../14-signup-and-onboarding.md).

## Scope
- `POST /v1/auth/register` accepts optional `account_type` (default `manager`);
  validate against the enum (reject others with 400); store on the user.
- Business auto-create (and `POST /v1/businesses`) sets `kind` = `family` when the
  owner's `account_type=parent`, else `team`.
- `GET /v1/me` and `GET /v1/businesses/mine` include `account_type` / `kind`.
- Employee creation (`POST /v1/employees`) unchanged — a "kid" is an `employee`
  membership under the hood.

## Files
- `apps/backend/internal/handlers/auth.go`, businesses handler,
  `internal/server/server.go`.

## Acceptance criteria
- [ ] Register with `account_type=parent` → user stored as parent; first business
      created as `kind=family`.
- [ ] Register without `account_type` → defaults to `manager` / `team`.
- [ ] Invalid `account_type` → 400, no rows written.
- [ ] `/v1/me` and `/v1/businesses/mine` echo the new fields.
- [ ] Employee creation still works and is unaffected.
