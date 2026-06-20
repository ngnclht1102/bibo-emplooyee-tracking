# 105 — Owner self-tracking (owner appears in their own dashboard)

- **Phase:** 7
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** —
- **Blocks:** —

## Goal
Let an owner track their own time and see it in their dashboard. Today the desktop
app already captures + syncs the owner's activity (their `owner` membership resolves
a business_id), but every report query filters `role = 'employee'`, so the owner's
own data is recorded yet never shown. Option 1: include owners in the reporting
queries and mark the owner's own row as **"You"**.

## Scope
- **Backend (`internal/store/reports.go`):**
  - `Roster`: change `m.role = 'employee'` → `m.role IN ('owner','employee')` so the
    owner appears in their business roster. Also `SELECT m.role` and sort owner first
    (`ORDER BY (m.role = 'owner') DESC, u.display_name`).
  - `RosterEntry`: add `Role string` (`json:"role"`).
  - `OwnsEmployee` (per-employee report access gate): change `m.role = 'employee'` →
    `m.role IN ('owner','employee')` so the owner can open their own detail page.
  - The per-activity reads use `ownedFilter` (scoped by business ownership, no role
    filter) — already work for the owner viewing themselves; no change needed.
  - Leave `ListEmployees` (the Employees **management** page) employee-only — that
    page is for managing added members, not self.

- **Web admin:**
  - `ReportEmployee` type gains `role?: string`.
  - Dashboard roster: tag the owner's own row with a subtle **"You"** badge (matched
    by `role === 'owner'`, cross-checked against the signed-in user id).

## Acceptance criteria
- [x] After the owner runs the desktop app + syncs, their activity shows in the
      dashboard roster (active time, last seen) and their detail page opens
      (verified: owner row present, `/reports/employees/:ownerId/activity` → 200).
- [x] The owner row is clearly marked "You" and sorted to the top.
- [x] Employees still appear; the Employees management page is unchanged.
- [x] Other owners' data remains inaccessible (ownership scoping intact — gate still
      requires `b.owner_user_id = caller`).
- [x] Backend builds; web typechecks.

## Notes
- The owner always has an `owner` membership, so the roster shows a "You" row even
  before they track anything (last seen —, 0 active). Acceptable / expected.
- Multi-business owners: desktop sync needs a business_id when the owner owns >1
  business (existing `ErrAmbiguousBusiness` behavior); out of scope here.
