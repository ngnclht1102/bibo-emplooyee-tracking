# 95 — Web: persona terminology across the dashboard

- **Phase:** 7
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** 94
- **Blocks:** 96

## Goal
Make the whole web admin speak the persona's language: a `kind=family` business
shows **"Kids"** everywhere it currently says "Employees" (singular **"Kid"**);
`kind=team` keeps **"Employees"**. Uses `memberTerms(kind)` from task 94.
See [docs/14-signup-and-onboarding.md](../14-signup-and-onboarding.md) (UX v2 §3).

## Scope
Resolve the active business kind via `useBusinesses().selected?.kind` and feed
`memberTerms(kind)` into every member-facing string:

- **Sidebar nav** (`components/AppShell.tsx`): the `Employees` nav label → `terms.many`.
- **Employees page** (`pages/Employees.tsx`): `<h1>`, "Add employee" button + modal
  title, "Loading employees…", "No employees…" empty state, the auto-create notice.
- **Dashboard** (`pages/Dashboard.tsx`): the `Employee` table header, the
  "No employees have synced…" empty state, the `Employees` link + notice.
- **EmployeeDetail** (`pages/EmployeeDetail.tsx`): breadcrumb "Dashboard / Employee"
  and the title fallback `"Employee"` → `terms.one`.
- **Settings** (`pages/Settings.tsx`): "…and all its employees", "every employee's
  app", override copy and success toasts → `terms.many` / `terms.one`.

Routes/paths stay `/employees` (no URL churn) — only visible text changes.

## Acceptance criteria
- [ ] With a `family` business every visible "Employee/Employees" reads "Kid/Kids".
- [ ] With a `team` business wording is unchanged from today.
- [ ] Singular vs plural correct (breadcrumb/title = singular; nav/headers = plural).
- [ ] Settings policy copy + toasts switch too.
- [ ] No hardcoded "Employee" strings remain in member-facing UI (grep clean).
