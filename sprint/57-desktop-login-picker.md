# 57 — Desktop: employee login picker UI

- **Phase:** 5
- **Type:** Implementation
- **Status:** Blocked
- **Blocked by:** 37, 51
- **Blocks:** —

## Goal
A login screen shown on launch when not authenticated, styled per
[docs/07-ui-design.md](../docs/07-ui-design.md).

## Scope
- On launch, if no valid session → show login.
- "Find your company/owner": searchable list from `GET /v1/public/businesses`.
- Pick a business → enter email + password (pre-created employee account) → login.
- Error states (wrong creds, offline) with retry.
- After login → proceed to the dashboard; logout returns here.

## Acceptance criteria
- [ ] Unauthenticated launch shows the picker.
- [ ] Business list loads, is searchable/filterable.
- [ ] Successful login advances to the dashboard and persists (task 51).
- [ ] Wrong credentials / offline show clear, recoverable errors.
- [ ] Matches the flat/token theme in dark + light.
