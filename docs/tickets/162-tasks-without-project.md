# 162 — Tasks without a project (CTR-37) + stale Tasks screen in the desktop app

**Status:** Done — not yet released
**Date:** 2026-11-04

## Problem
Two things found while using 1.7.0 as an owner:

1. A project created in the app's **Admin → Projects** screen did not appear on the
   member-side **Tasks** screen, so "New task" stayed disabled and the screen still
   said the team had no projects. The project *was* saved on the server — the Tasks
   screen just never refetched.
2. Every task had to belong to a project. A quick one-off task ("fix the printer")
   forced the user to invent a project first.

## What changed
- **Tasks screen refreshes on open.** The work context (projects, tasks, this week's
  time) was only fetched at launch and on window focus, which never fires when the
  user moves between screens inside the same window. It is now also fetched whenever
  the Tasks screen opens.
- **A task can have no project.** `tasks.project_id` is nullable (migration
  `00017_task_no_project.sql`). Every task dialog — member Tasks, native Admin →
  Tasks, web-admin Billing → Tasks — has a **"No project"** option, and the task list
  filters gained a "No project" choice. The "add a project first" blockers are gone.

## Behaviour of project-less time
A project is what says whether work is billable and at what rate, so with no project:
- the time is **billable**, at the member's own hourly rate (`COALESCE(p.billable, true)`,
  no project rate to override);
- it is never hidden by the "archived project" filter;
- invoice lines read `task — person` instead of `project · task — person`.

## Touched
- backend: `00017_task_no_project.sql`, `store/billing.go` (LEFT JOIN projects + empty
  project id/name, `NULLIF($, '')::uuid` on save, project check skipped when empty),
  `handlers/billing.go` (project no longer required), `billing/billing.go` (`desc`).
- desktop: `screens/Tasks.tsx`, `screens/admin/BillingTasks.tsx`, `tasks.json` ×7
  (`noProject` added, `noProjects` / `admin.tasks.needProject` dropped).
- web-admin: `pages/billing/Tasks.tsx`, `TaskDetail.tsx`, `Time.tsx`, `billing.json` ×7
  (`common.noProject` added, `tasks.needProject` / `tasks.goProjects` dropped).

## Verified
- `go build ./...`, `go vet ./...`, `go test ./...` against a throwaway Postgres on
  :5499 — including the new `TestTaskWithoutProject` (save with no project, list,
  billable entry, invoice preview at the member rate, move in and out of a project).
- web-admin + desktop `tsc --noEmit` and `vite build`.
- Not yet exercised in a running desktop build (needs a rebuild + a backend with the
  new migration).
