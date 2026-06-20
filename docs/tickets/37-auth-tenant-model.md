# 37 — Auth + tenant model

- **Phase:** 5
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** 35
- **Blocks:** 39, 41, 51, 57, 59

> Note: added `POST /v1/auth/register` (owner self-signup — there was no other way to
> create the first user) and a protected `GET /v1/me`. Employees are still created by
> owners (task 39), not via register.

## Goal
Users, businesses, memberships, and JWT auth per
[docs/11-backend-and-sync.md](../11-backend-and-sync.md).

## Scope
- Migrations: `users`, `businesses` (incl. `screenshot_retention_days`),
  `memberships`, `devices`.
- argon2id password hashing.
- JWT access + refresh (`internal/auth`); `user_id` always derived from the token.
- Auth middleware: `Bearer` → user; rejects missing/expired.
- Endpoints:
  - `GET  /v1/public/businesses` (public picker: business_id, name, owner_name).
  - `POST /v1/auth/login` `{email, password, business_id?}` → tokens.
  - `POST /v1/auth/refresh`.
- Login rate-limit middleware.

## Acceptance criteria
- [ ] Public business list returns all businesses with owner names, no auth.
- [ ] Login with correct creds → valid access + refresh; wrong creds → 401.
- [ ] Refresh issues a new access token; expired/invalid refresh → 401.
- [ ] Protected route rejects requests without a valid token.
- [ ] Passwords stored only as argon2id hashes (never plaintext/log).
- [ ] Repeated bad logins are rate-limited.
