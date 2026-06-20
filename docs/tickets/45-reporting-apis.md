# 45 — Reporting read APIs

- **Phase:** 5
- **Type:** Implementation
- **Status:** Blocked
- **Blocked by:** 41, 43
- **Blocks:** 63

## Goal
Owner-facing read APIs per [docs/11-backend-and-sync.md](../11-backend-and-sync.md).
This is a separate read path; it does not feed the desktop.

## Scope
- `GET /v1/reports/employees` — roster + last-seen + today's active time.
- `GET /v1/reports/employees/:id/activity?from&to` — timeline + app breakdown.
- `GET /v1/reports/employees/:id/keystrokes?from&to` — bucket counts.
- `GET /v1/reports/employees/:id/browser?from&to` — visit list.
- `GET /v1/reports/employees/:id/screenshots?from&to` — paginated metadata.
- `GET /v1/screenshots/:client_uuid` — auth-gated image streaming from disk.
- Every endpoint enforces the caller owns the business the employee belongs to.

## Acceptance criteria
- [ ] Roster shows each employee with last-seen + active time today.
- [ ] Activity/keystrokes/browser respect `from`/`to` ranges.
- [ ] Screenshot list paginates; image endpoint streams the file only to an authorized owner.
- [ ] An owner cannot read another business's employees (403).
- [ ] Image endpoint never accepts/echoes a filesystem path.
