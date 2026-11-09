# 163 — Project members: optionally limit a project to selected people

**Status:** Deployed to STAGING 2026-11-07 (production and the public desktop release still pending)
**Date:** 2026-11-07

## Feedback that started it
> "Your Projects feature no option to add an employee or member to a specific project"

Today a project is workspace-wide: every member of the workspace sees every active
project in the desktop app and can log time against any of its tasks. There is no way
to say "this project is only for Ana and Minh".

## Decision
Keep the current behaviour as the default and make grouping **optional**:

- **A project is open by default** — every member of the workspace can use it. Nothing
  changes for existing workspaces, and a small team never has to think about access.
- **A project can be limited** to a chosen set of members, either when it is created or
  later. Limiting it is one switch plus a checkbox list of people.
- **The owner always has access to every project**, limited or not. The list is about
  employees; an owner must never be able to lock themselves out of their own workspace
  (and owner self-tracking, ticket 105, keeps working).

## Data model
Migration `00018_project_members.sql`:
- `projects.restricted boolean NOT NULL DEFAULT false` — false = open to everyone.
- `project_members (project_id, user_id, added_at)` — the allow-list, only consulted
  when `restricted` is true. Rows are kept when a project is switched back to open, so
  toggling the switch twice does not lose the list.

Visibility rule, used everywhere: *the caller is the owner, or the project is not
restricted, or the caller is in `project_members`.*

## What it changes for a member (desktop)
- `/v1/work/context` returns only the projects they may use.
- The Tasks screen lists only tasks of those projects (project-less tasks stay visible
  to everyone — they belong to no project, so nothing can limit them).
- Creating a task in a project they are not on, or logging time on such a task, is
  refused by the backend, not only hidden in the UI.
- Time already logged before a member was removed from a project is left untouched —
  it stays on the task, on the invoices and in the owner's reports.

## What it changes for an owner
The owner keeps seeing everything. Two new places to manage access:

1. **Billing → Projects, the project dialog** (new and existing projects): an *Access*
   section with two radio cards — "Everyone in the workspace" / "Only selected people" —
   and, for the second, a searchable checkbox list of members (avatar, name, role).
   The owner's own row is always on and disabled, with "always has access" as the hint.
2. **Billing → Projects, "Who works on what" tab**: a members × projects grid. One row
   per member, one column per active project; a checkbox where the project is limited,
   a muted tick where it is open. Each column header carries a small
   **Everyone / Selected people** picker, so the header states the project's mode and
   changes it in one go — the fast way to re-group a whole team after a reshuffle.
   Every tick saves immediately.

The projects table itself gains a **Who can work on it** column — "All members", or an
avatar stack plus "N people" — so the state is visible without opening anything.

The **Tasks** dialog only offers assignees who can actually work on the chosen project,
so an owner cannot assign a task into a project the person cannot see.

The native **Admin → Projects** screen in the desktop app gets the same Access section
in its project dialog (no grid — that stays web-only).

## API
- `Project` gains `restricted: bool` and `member_ids: string[]` (`GET /projects` returns
  them, so the grid needs no extra call).
- `POST|PUT /projects` accept `restricted` and `member_ids` (full replace of the
  allow-list; omitting `member_ids` leaves it as it is). Every id must be a member of
  the workspace.

## Touched
- backend: `00018_project_members.sql`, `store/billing.go`, `handlers/billing.go`.
- web-admin: `api/billing.ts`, `pages/billing/Projects.tsx`, `Tasks.tsx`, `common.tsx`,
  `theme.css`, `billing.json` ×7.
- desktop: `work/billingApi.ts`, `screens/admin/BillingProjects.tsx`, `tasks.json` ×7.

## Verified
- `go build ./...`, `go vet ./...`, `go test ./...` against a throwaway Postgres on :5499
  — including the new `TestProjectMembers` (limit a project, non-members dropped from the
  allow-list, project and task visibility per member, reopening keeps the list, an empty
  list clears it).
- End to end against a local backend + seeded team (owner + 5 employees, 4 projects):
  - an employee not on a limited project does not get it from `/v1/work/context`, does
    not see its tasks, and is refused (403) when logging time on one or creating a task
    in it;
  - an employee who is on it sees the project and its task and logs time (200);
  - the owner assigning a limited project's task to someone not on it gets
    "that person is not on this project — add them to it first" (403);
  - ticking a box in the grid persists (`member_ids` grew from 2 to 3).
- web-admin + desktop `tsc --noEmit` and `vite build`; i18n key sets checked against `en`
  for all 7 locales.
- Looked at in the browser at 1440×900 in light and dark: projects table with the access
  column, the grid, and the project dialog with the people picker.
- **Staging (2026-11-07):** `deploy/deploy.sh` → backend `20261107-123910` on
  employeetracking.namnguyen.pro, migration `00018` applied there, `/healthz` 200,
  marketing + `/admin` serve, and the deployed admin bundle carries the new UI.
- **Test desktop builds (1.7.1, staging-pointing)** for hands-on QA — built with
  `--features staging --config src-tauri/tauri.staging.conf.json`, so they talk to
  employeetracking.namnguyen.pro, install side by side with the production app
  ("BiBoTracking Staging", own bundle id) and are NOT a public release:
  - macOS: `BiBoTracking Staging_1.7.1_universal.dmg` — universal, Developer ID
    signed, notarized + stapled.
  - Windows: `BiBoTracking Staging_1.7.1_x64-setup.exe` (NSIS) from the LAN build PC.
    The build errors at the very end on the updater signature (`TAURI_SIGNING_PRIVATE_KEY`
    vs `..._PATH`) — harmless here, the installer is complete and no OTA artifact is
    wanted for a test build.
- Not exercised by hand in a running desktop build yet; production untouched.
