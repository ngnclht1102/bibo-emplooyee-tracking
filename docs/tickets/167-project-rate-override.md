# 167 — Project rate stops overriding people (CTR-40)

**Date:** 2026-11-08 · **Status: Implemented on `release/v1.7.3`** ·
builds on [157](157-billing.md), [159](159-billing-member-invoices.md), [163](163-project-members.md)

## What changed and why

CTR-40 asked whether we support a project rate *per person*. We don't — rates come in two
layers only: each member has an hourly rate with effective-dated history, and a project has
one flat rate. The problem was the precedence: a project rate **outranked everyone's own
rate**, all-or-nothing. The moment one person on a project needed a different number, the
owner had to clear the project rate and go fix every member rate instead.

A project rate is now just the **fallback** for people who have no rate of their own, and it
only outranks member rates when the owner explicitly ticks *"Use this rate for everyone on
this project"*.

Rate resolution for a piece of logged time, in order:

1. the project rate — only if the project is set to override
2. the member's own rate in force on that day
3. the project rate as a fallback
4. otherwise unrated (shows up in the draft's "missing rates", as before)

A `0` project rate stays a real rate in both roles, not "unset".

### Decisions

- **Existing projects keep overriding.** The migration backfills the new flag to `true`
  wherever a rate is already set, so no live project silently re-prices. New projects start
  unticked.
- **The flag is only meaningful with a rate.** Clearing the rate clears the flag — enforced
  in the handler, and the checkbox only appears once a rate is typed.
- Already-issued invoices are untouched: they freeze their rates on the invoice lines.

### Still not supported

A rate per *(project, person)* pair — "Ann is 80 on Project X but 60 on Project Y" — which is
what CTR-40 really wants for an agency. That needs a third rate layer between the project and
the member rate, and arguably a split of bill-rate from pay-rate first (today one number does
both jobs). Not in this ticket.

## Where

- `00020_project_rate_override.sql` — `projects.rate_overrides_members`, backfilled from
  `rate_cents IS NOT NULL`.
- `billing.EntryRate` — new precedence, with tests for each branch.
- Project CRUD (store + handler) carries the flag; the handler forces it off when there is
  no rate.
- Both owner-side project editors get the checkbox — web-admin **Billing → Projects** and the
  desktop **Admin → Projects** screen. The desktop one matters: without the field there,
  saving a project from the app would have posted the flag as `false` and silently dropped an
  override. The projects table marks a non-overriding rate as "Fallback only".
- New strings in all 7 locales (web `billing.json`, desktop `tasks.json`); `projects.rateHint`
  reworded away from "all time on this project is billed at this rate".

## Verified

- `go build ./...`, `go vet ./...`, `go test ./...` clean; `billing` package tests cover
  override on/off, the unrated-member fallback, no-rate-anywhere, and the `0`-rate cases.
- Migrations 00001→00020 applied in order to a scratch Postgres: the new column lands, and a
  project created before the migration with a rate comes out `override=true` while a
  rateless one comes out `false`. The two reworded queries (project select, unbilled
  entries) run clean against the real schema.
- `tsc --noEmit` + `vite build` clean in `apps/web-admin` and `apps/desktop`.
