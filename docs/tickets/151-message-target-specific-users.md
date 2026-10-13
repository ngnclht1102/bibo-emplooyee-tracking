# 151 — In-app messages: target specific users (test before sending)

**Date:** 2026-10-13 · **Status: Implemented (not deployed)**

## What

The message editor's Audience section has a **Specific users** picker: search by name,
username or email, pick one or more users. When any are picked, **only those users** get
the message — so a super admin can send it to themselves / a test account first, then
clear the list to release it to everyone. Other audience rules (roles, kinds, platform,
locale, version, dates, Active, the promo owner-only gate) still apply on top.

## How

- `audience.users` (user ids) in the existing `messages.audience` JSONB — no migration.
- `Eligible` checks the viewer's user id; list + survey-answer endpoints pass it.
- New super-admin `GET /v1/admin/users?q=` (name/username/email, ≥2 chars, max 20) and
  `?ids=a,b` (resolves saved ids to names in the editor).
- Web-admin: chips + search box in the editor, 7 locales.

## Verified 2026-10-13

- Go tests (user list match / exclusion), `go vet`, web-admin `tsc` + `vite build`.
- End-to-end on a throwaway Postgres + backend + web-admin in the browser: search by name
  and email works, non-super-admin gets 403, a message targeted at one user is offered to
  them and not to another; adding the second user in the UI and saving makes it reach them.
