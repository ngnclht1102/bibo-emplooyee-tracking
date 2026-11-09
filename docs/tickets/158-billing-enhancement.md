# 158 — Billing enhancement: self-assign, menu-bar task control, native admin + task detail

**Date:** 2026-10-25 · **Status: Implemented, on staging (not on production)** · issue **CTR-16** · builds on [157](157-billing.md)

## What

Four gaps in the billing system (157), from the owner's own use of the app.

### 1. A new task belongs to whoever created it
- Creating a task from the **desktop app** assigns it to you — now for owners too, not
  just members (an owner self-tracks and works on tasks like anyone else).
- Members still cannot assign work to someone else: whatever they send, the task comes
  back assigned to them.
- On the **web**, the "New task" dialog preselects the signed-in owner. The API only
  defaults the assignee for desktop (`/v1/work/`) calls, so clearing the field on the
  web still produces a genuinely unassigned task.

### 2. Task control from the menu bar
- The tray menu grows a task section: **Start a task ▸** (the open tasks assigned to
  you, up to 10) when idle, **Stop timer · <task>** while one runs.
- On macOS the elapsed time sits next to the tray icon ("7m", "1h07"); the tooltip
  names the task. Both refresh on the existing 2-second status tick.
- The timer stays in the UI (it owns active-time accounting and the offline upload
  queue). The tray only emits a `tray-task` event; the UI pushes its task list and
  running timer down with `set_tray_tasks`. The whole menu is rebuilt on change —
  `on_menu_event` is a global listener, so dynamic item ids keep dispatching.
- The timer moved out of the Tasks screen into `useTaskTimer`, mounted in `App`, so it
  keeps running (and stays stoppable) from any screen or with the window closed.

### 3. Projects and Tasks in the app, like web-admin
- Two owner-only screens in the Admin group: **Projects** (clients + projects, create
  and edit, archive, project rate override) and **Tasks & time** (filter by project,
  assignee and status; create, assign, close, delete).
- They call the same owner API web-admin does, through one new Rust command
  (`billing_request`), which only allows `/v1/businesses/{id}/billing/…`. The backend
  re-checks ownership as before.

### 4. Task detail
New `GET /v1/businesses/:id/billing/tasks/:tid/detail?tz=&shots=`, rendered both in
web-admin (`/billing/tasks/:id`, linked from the task title) and in the app's native
Tasks screen:

- time logged per member, and every entry with its timer window and invoice;
- the **screenshots captured while a timer ran on that task** (reuses the existing
  gallery + lightbox, newest first);
- the **share of typing** that landed on the task — keystrokes inside the task's timer
  windows against everything that person typed on the same local days.

## How screenshots and keystrokes are linked to a task

Captures are **not** stamped with a task id. The detail view derives them from the
wall-clock windows the timer ran, so it works for time already logged and leaves the
capture/sync pipeline untouched. `duration_s` is *active* time only and cannot stand in
for the window, so timer uploads now also carry `ended_at`
(migration `00014_task_detail.sql`, additive; older rows fall back to
`started_at + duration_s`).

Consequence worth knowing: **time logged by hand contributes no screenshots and no
keystrokes** — there is no window for it. The UI says so.

## Also fixed

`/v1/work/*` returned 409 `business_id is required` for anyone in more than one
workspace, because the desktop never named one — the Tasks screen was simply broken for
such owners. It now sends the workspace picked in the Admin section.

## Verified 2026-10-25

- **`TaskDetail` against a real Postgres 15** (`internal/store/billing_detail_test.go`,
  skipped unless `CTRACKING_TEST_DB` points at a throwaway cluster): windows, time per
  member, manual entries contributing time but no captures, no leakage from another
  task's windows, newest-first screenshots, and the time-zone mapping of the day
  denominator (an 18:00 UTC bucket counts on the 20th at UTC, the 21st at +07:00).
  It caught one wrong assumption of mine, not in the code: the denominator is *all*
  that person's typing that day, whatever they typed it on — which is the point of a share.
- **18-check HTTP end-to-end** against that cluster: the five assignment rules above,
  `ended_at` accepted and validated, repeated timer uploads idempotent, the detail
  payload's numbers, a bad `tz` rejected (400), and a member refused the owner's
  detail view (403).
- `go build ./...`, `go vet ./...`, full `go test ./...`, `cargo check`, web + desktop
  `tsc --noEmit` and `vite build`. New strings in all 7 locales (key sets verified equal).
- **Staging** (`employeetracking.namnguyen.pro`, build `20261025-215354`): migration 14
  applied on Postgres 18; the same 19-check end-to-end run passes against it; with
  keystroke + screenshot rows placed inside a timer window, the detail endpoint reports
  the expected 150/200 typing share and 2 of 3 screenshots, newest first. The web task
  detail page renders (dark, and at a narrow width): stat cards 30m / 75% / 2 / 1, the
  by-member row, the timer window on the entry, and a 2-tile gallery.
  Test data left in place for QA: owner `ctr16-stg-owner@test.local`, member `ctr16stg1`
  (password `pw-ctr16-test`), workspace "CTR16 QA staging" — delete when QA is done.
- One styling fix came out of that pass: the stacked panels on the task detail page sat
  flush against each other (neither `.notice` nor `.admin-tablecard` carries a margin),
  so the page wraps them in a `.bill-stack` grid — 16 px between every panel.

## Not in this ticket

- Stamping a task id onto screenshots/keystrokes at capture time (would be exact for
  future data, but needs the desktop → sync → backend pipeline changed and is not
  retroactive).
- Rates, invoices and the Time report in the app — money stays on the web.
- A desktop release: the tray task control and the native admin screens need a new
  build; the API and web work with the shipped desktop version.
- Interactive QA — the menu-bar behaviour on macOS and Windows, the native owner
  screens, and a task detail built from real captures: **CTR-17**.
