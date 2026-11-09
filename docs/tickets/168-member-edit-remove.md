# 168 — Edit and remove a member (CTR-42)

**Date:** 2026-11-09 · **Status: Implemented on `release/v1.7.2`** ·
builds on [61](61-web-admin-management.md), [97](97-web-wizard-rail-and-add-members.md),
[163](163-project-members.md)

## What changed and why

> *"I cannot add or change member details."* — CTR-42, a trial owner on 2026-11-07

Half the report was a feature that never existed: the roster was **read-only**. An owner
could add a member and view their reports, and that was it — no rename, no change of
login, no password reset, no way to remove anybody. One typo in an email was permanent.

The other half was the dead end that follows from it. Reconstructed from the prod logs and
database, the reporter's session went:

| time (UTC) | what happened |
|---|---|
| 06:46 | added "Megan" with the wrong email (`debtors@platvest.co.za`) |
| ~07:00 | tried to correct it — **nothing in the UI can change a member** |
| 07:21 | re-added her with the same email → `409 already taken` (the only escape, deleting her, also didn't exist) |
| 07:21 | created a second, empty business, apparently looking for a way out |
| 07:48 | added a **duplicate** "Megan" under a different email; both stayed on the roster |
| 09:20 | sent the feedback |

So "add" worked — it is what left them with a duplicate they then couldn't clear. The fix is
edit plus remove: with the login editable in place, a typo is a 10-second correction and the
`409` never comes up.

### What an owner can now do

A pencil **Edit** action on every roster row opens a dialog over the member:

- **Display name** and **login** (username or email) — same single-field convention as the
  add dialog: a value with an `@` is stored as the email and clears the username, anything
  else is a username and clears the email, so a member never ends up with neither.
- **New password** — blank means "keep the current one"; the same Generate button as the add
  dialog produces a temp password to hand over.
- **Remove** — detaches the member from this workspace.

Backend: `PATCH /v1/businesses/:id/employees/:employeeID` and
`DELETE /v1/businesses/:id/employees/:employeeID`, both behind the existing owner check on
the business.

**Both admin surfaces got it**, not just the web dashboard. The desktop app has its own
native Members screen (ticket 158) whose roster had exactly the same gap — add, add
workspace, view, nothing else; its source even carried the comment *"Backend supports create
+ list only — no edit/delete yet"*. An owner who works from the app rather than the browser
would still have been stuck, so the same dialog exists there, over two new Tauri commands
(`admin_update_employee` / `admin_remove_employee`) on the same two endpoints. The desktop
roster also lists the owner's own row, so Edit is hidden for `role === "owner"` there.

### Every roster, one control

The first cut only put Edit on the dedicated members list, which left the action missing
from the other places the same employee row is rendered — jarring, since the row looks
identical. The pencil now comes from one shared component per app, used by every roster:

| Surface | App |
|---|---|
| Members | web + desktop |
| Dashboard roster | web |
| Admin dashboard roster | desktop |
| Team Overview | desktop (renders the admin dashboard, so it inherits it) |

The dialog itself is shared the same way rather than copied per screen, so the fields,
validation, error mapping and the remove button can't drift apart. Owners' own rows never
show the action: the web members list has no owner row, while the dashboard rosters and the
desktop list do (badged "You"), so those hide it by role — and the backend refuses it
regardless.

**Deliberately excluded:** the super-admin business overview. It lists businesses the caller
does *not* own, and the endpoints are scoped to `b.owner_user_id = caller`, so an Edit action
there could only ever fail.

### Decisions

- **Remove detaches, it does not delete.** Only the membership row goes. The account, its
  devices, and every activity row, screenshot and time log survive, and issued invoices keep
  their lines — `invoice_lines.user_id` is `ON DELETE RESTRICT`, so a real delete would fail
  for anyone already invoiced and would silently destroy tracked history for everyone else.
  The person simply drops out of the roster and the reports.
- **Removal also clears them from restricted projects** of that business ([163](163-project-members.md)),
  in the same transaction — otherwise a removed member would silently keep project access if
  they were ever added back.
- **Removal does not free the login.** The account still exists, so its email/username stays
  taken. Fixing the record with Edit is the intended route, not remove-and-re-add.
- **The edit is scoped to an `employee` membership of the business**, enforced in SQL rather
  than in the handler. An owner cannot reach their own row or anyone outside their roster
  through this path, so it can't be used to rewrite another owner's credentials.
- **An owner's own row has no Edit action.** The web roster filters `role = 'employee'` so
  owners never appear there; the desktop roster does list the owner (with a "You" badge), so
  the action is hidden by role. Either way the backend refuses it.
- **The desktop dialog maps only the one error an owner actually hits.** Tauri surfaces a
  backend failure as a raw `backend returned 409: {…}` string; a conflict becomes the
  localized "already taken" line and anything else passes through verbatim, matching how the
  add dialog already behaves.
- **Existing sessions are not revoked** when the login or password changes. Tokens are JWTs
  with no server-side session table, so a member already signed in on the desktop keeps
  working until their refresh token expires — they only need the new credentials at the next
  sign-in. Called out in the dialog so the change isn't a surprise.
- The reporter's own duplicate member and stray empty business were **left alone**: they can
  clean both up themselves once this ships.

## Verification

- `go build ./...`, `go vet ./...`, and the full backend suite green against a throwaway
  Postgres.
- New store test `TestUpdateAndRemoveEmployee` walks the reported scenario: a member added
  with the wrong email, corrected in place, switched email→username, a taken login reported
  as a conflict rather than a 500, cross-business and own-owner edits refused, then removal
  leaving the account and clearing the project allow-list.
- Web: `tsc --noEmit` + `vite build` clean; the flow driven end to end in the browser against
  a local stack (edit name + login, duplicate-login error inline on the field, generated
  password actually usable at `/v1/auth/login`, remove emptying the roster).
- Desktop: `cargo check` clean, `tsc --noEmit` + `vite build` clean, and all 7 locale
  catalogs at full key parity. The native dialog itself has not been clicked through in a
  running app yet — it reuses the verified endpoints and mirrors the shipped add dialog, but
  a QA pass on macOS and Windows is worth doing before the release build.

## Not in scope

- Re-inviting a removed member, or any undo of a removal.
- Changing a member's **role** (employee ↔ owner) — there is still exactly one owner per
  business.
- Freeing up a login by deleting the underlying account outright.
