# 104 — Member login by username (not only email)

- **Phase:** 7
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** —
- **Blocks:** —

## Goal
Let pre-provisioned members (employees / kids) sign in with a **username** instead
of an email. Kids especially often have no email; an owner-assigned username like
`namfamily_kid1` / `yojeecorp_emp1` is easier to hand out. Email stays supported.
**Owners can also self-register with a username or email** (decided during build) —
every auth/account form accepts either identifier.

## Scope
- **Backend schema (`00007_member_username.sql`):**
  - Add `users.username text` (lowercased by app), unique when present
    (`CREATE UNIQUE INDEX ... WHERE username IS NOT NULL`).
  - `email` becomes nullable (members may have only a username).
  - Add a CHECK so every user has at least one identifier (`email IS NOT NULL OR
    username IS NOT NULL`).

- **Backend store:**
  - `User`/`Employee` gain `Username`. Reads `COALESCE(email,'')`, `COALESCE(username,'')`.
  - Replace `GetUserByEmail` with `GetUserByIdentifier` — matches `email OR username`
    (lowercased). Login uses it.
  - `CreateEmployee` takes `email` (optional) + `username` (optional); stores NULL for
    a blank identifier. At least one required.

- **Backend handlers:**
  - `POST /v1/auth/login` accepts an identifier (`identifier`, falling back to the
    existing `email` field) — so the desktop app needs no API change, only a relabel.
  - `POST /v1/employees` accepts `username` and optional `email`; requires display_name
    + at least one identifier; validates username `^[a-z0-9_]{3,32}$`.
  - `Me` / token `issue` include `username` in the user payload.

- **Web admin:**
  - Signup wizard add-members: the login field becomes **"Username or email"**,
    prefilled with a generated username `<orgslug>_<emp|kid><N>` (e.g. `yojeecorp_emp1`).
    On add, a value containing `@` is sent as `email`, otherwise as `username`.
  - Sign-in page: relabel "Email" → "Email or username"; send as identifier.
  - `api/endpoints.ts` + `api/types.ts`: `createEmployee` gains `username`/optional
    email; `login` sends an identifier; user type gains `username`.

- **Desktop:**
  - Login screen: relabel field to "Email or username", input `type="text"` (was
    email), send the typed value as the identifier. No Rust/back-end change needed.

- **Owner self-signup + all forms (decided during build):**
  - `POST /v1/auth/register` accepts `username` or `email` (≥1 required; same username
    regex); `CreateUser` stores NULL for the unused one; conflict → 409.
  - Signup wizard "Create your account" field → **"Email or username"** (`type=text`),
    routed to email/username by `@`. Rail copy: "Name, email or username, password".
  - Dashboard add-member modal (`pages/Employees.tsx`) → "Username or email" field,
    same routing + 409/username error mapping.
  - Identity **display** falls back to username when email is blank: Dashboard +
    Employees rosters (column relabeled "Login"), EmployeeDetail header, Settings
    account row. Reports pipeline (`RosterEntry` / `ReportEmployee`) carries `username`.

## Acceptance criteria
- [x] An owner can create a member with only a username; that member signs in with it.
- [x] Email-based login (owners + members who have email) still works.
- [x] Add-members field prefills `<orgslug>_<emp|kid><N>` and increments per add.
- [x] Username uniqueness enforced; duplicate → 409 (invalid chars → 400).
- [x] Backend builds + migrates (version 7); web-admin + desktop typecheck.
- [x] Owners can self-register + sign in by username or email; verified via API.
- [x] All auth/account forms (signin, signup account step, dashboard add-member)
      accept username or email; identity displays fall back to username.

## Notes
- Generated slug = orgName lowercased, non-alphanumerics stripped, capped (~20 chars).
- Owners still register with email only (no username self-signup in this ticket).
