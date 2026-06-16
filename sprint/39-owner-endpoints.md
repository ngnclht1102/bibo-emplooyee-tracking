# 39 — Owner endpoints (business + employees)

- **Phase:** 5
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** 37
- **Blocks:** 61

> Note: employee creation is `POST /v1/employees` with an optional `business_id`
> (omit it for the auto-business / skip-business flow) rather than
> `POST /v1/businesses/:id/employees`. One endpoint covers both the explicit and
> auto-business cases. Listing stays `GET /v1/businesses/:id/employees`.

## Goal
Owner management API per [docs/11-backend-and-sync.md](../docs/11-backend-and-sync.md).

## Scope
- `POST /v1/businesses` — create business + owner membership.
- `GET  /v1/businesses/mine` — businesses the caller owns.
- `POST /v1/businesses/:id/employees` — create employee user + employee membership;
  owner sets email + temp password.
- **Auto-business:** creating an employee while the caller owns no business creates a
  default business (`"<display_name>'s Team"`) first, then the employee.
- `GET  /v1/businesses/:id/employees` — roster.
- `PATCH /v1/businesses/:id/settings` — e.g. `screenshot_retention_days`.
- Authorization: only the owner of a business may manage it / its employees.

## Acceptance criteria
- [ ] Owner creates a business; appears in `/mine`.
- [ ] Creating an employee with no existing business auto-creates one, then the employee.
- [ ] Created employee can log in (task 37) with the owner-set credentials.
- [ ] A non-owner cannot create employees or change settings for someone else's business (403).
- [ ] Duplicate employee email is rejected with a clear error.
- [ ] `PATCH settings` persists `screenshot_retention_days` (incl. null = forever).
