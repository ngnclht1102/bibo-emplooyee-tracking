# 157 — Billing: tasks, time logs, hourly rates and invoices

**Date:** 2026-10-13 · **Status: Implemented (staging only, not on production)** · branch `feat/billing`

## What

Owners bill their clients for the team's hours: logged time × each person's hourly rate.

- **Web dashboard (owners)**, new "Billing" sidebar group (team workspaces only):
  - **Time** — everyone's time logs with filters (period, person, project), stat cards
    (logged, billable, unbilled estimate, tracked), add/edit/delete, and *logged vs tracked*
    per person (logged time well above what the desktop recorded is flagged).
  - **Tasks** — all tasks; owners create, assign, close, delete (if no time on it).
  - **Projects** — clients and projects. A project without a client is internal (never
    invoiced); a project rate overrides each person's rate; archive hides it from desktop.
  - **Invoices** — outstanding / overdue / paid this month / drafts; "New invoice" picks a
    client + period, previews lines (task × person × rate) with tax, warns about people with
    no rate, creates a numbered draft (INV-0001…). Draft → sent → paid (or void). Print / PDF
    via the browser (print stylesheet keeps only the document).
  - **Rates** — each person's hourly rate with history (effective-from date), the workspace
    currency, and the "from" details printed on invoices.
- **Desktop app (every signed-in team member)**, new "Work → Tasks" screen: create tasks
  (assigned to yourself), a task timer, log/edit/delete your own time, this week's time.
  - The timer logs **only active time** (from this machine's own tracking, so idle and paused
    time are left out); under a minute ⇒ nothing logged. Uploads carry a client UUID and are
    queued locally when offline, so retries never double-log.
  - Members never see rates or money.

## Rules

- Time is billed at the rate in force **on the day it was logged** (project rate wins).
  Invoice lines freeze rate + amount at creation; later rate changes never alter them.
- Time on an invoice (draft included) is **locked**. Deleting a draft or voiding an invoice
  releases it to be billed again. Sent/paid invoices can't be deleted, only voided.
- Members edit only their own time and only tasks they created or are assigned to.
- Family workspaces have no billing (API 403, nav hidden).
- Money is integer cents of the workspace currency; rounding half-up.

## API

- Owner: `/v1/businesses/:id/billing/{settings,members,rates,clients,projects,tasks,entries,tracked,invoices}`.
- Member (desktop): `/v1/work/{context,tasks,entries}` — desktop calls them through one Rust
  command (`work_request`) that only allows the `/v1/work/` prefix.
- Migration `00013_billing.sql`: businesses += currency, billing_details,
  invoice_next_number; new clients, projects, tasks, member_rates, time_entries, invoices,
  invoice_lines. **Additive only.**

## Verified 2026-10-13

- Go unit tests for rates, money rounding, invoice line grouping and status rules.
- ~70-check API end-to-end on a throwaway Postgres: permissions (employee vs owner vs
  outsider vs family), timer idempotency, rate history, invoice totals with tax, locking,
  void/delete release, numbering, delete guards, archived projects, cross-workspace isolation.
  0 server errors.
- Web pages in a browser (light + dark, 1440 and 390 wide); desktop Tasks screen in a dev
  build signed in as an employee: start/stop timer → 2 minutes of active time logged.
- Staging (employeetracking.namnguyen.pro, Postgres 18): migration 13 applied, the same
  end-to-end run passes. It caught one bug fixed here: Postgres 18 reports a blocked
  delete as 23001 (restrict_violation), 16 as 23503 — both now mean "in use, archive instead".
- `go vet`, `cargo check`, web + desktop `tsc` and `vite build`. 7 locales (web + desktop).

## Not in this ticket

- Emailing invoices (PDF via print for now), payroll / cost rates, per-client currency,
  approvals of time.
- Desktop needs a **new desktop release** for the Tasks screen; the web + API work with the
  current desktop version (it just doesn't show Tasks).
