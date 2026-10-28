# 159 — Billing turned around: members invoice the workspace (clients removed)

**Date:** 2026-10-27 · **Status: Implemented, on staging (not on production)** ·
builds on [157](157-billing.md) and [158](158-billing-enhancement.md)

## What changed and why

157 billed *outwards*: the owner invoiced external clients for the team's hours. That is
not what this product is for. Now the money flows *inwards*: **each member invoices the
workspace for their own logged time, and the owner receives, pays or voids it.** Nobody
invoices anyone outside, so the whole client concept is gone.

Four decisions settled before the work (BossBrian):

- **Clients are removed entirely** — table, UI and `projects.client_id`. A project is just
  a grouping now; `billable` alone decides whether its time can go on an invoice.
- **Only a member raises an invoice**, always to the workspace. The owner cannot create
  one, not even on a member's behalf.
- **draft → sent → paid**, no approval step. The member creates, edits and submits; the
  owner records payment, takes a payment back, or voids.
- **A member now sees their own rate and their own amounts.** The owner still sets rates;
  other people's rates and workspace-wide money stay hidden.

## Who may do what

| | member (desktop, `/v1/work/*`) | owner (web-admin, `/businesses/:id/billing/*`) |
|---|---|---|
| create a draft | yes, from their own unbilled time | **no** (403 on `/work`, no route on the owner side) |
| edit due date / tax / notes | own draft only | no (409) |
| submit (draft → sent) | yes | no (409) |
| mark paid, mark unpaid, void | no (409) | yes |
| delete a draft | own | any (it releases time the workspace is waiting on) |
| see | only their own invoices | every invoice in the workspace |

The rules live in one place, `billing.NextStatus(from, to, byOwner)`.

## Backend

- Migration **`00015_member_invoices.sql`**: drops `clients` and `projects.client_id`;
  `invoices.client_id` → `invoices.user_id` (NOT NULL, the member who raised it);
  `memberships.billing_details` added — the member's own "from" block (address, tax id,
  bank account), which they fill in from the app. Existing invoices were client invoices
  (billing never reached production), so the Up releases their time and deletes them.
- Unbilled time is now scoped **per member** (`e.user_id = $2 AND p.billable`) instead of
  per client. Rate resolution, line grouping, freezing and locking are unchanged: project
  rate wins, else the member's rate on the day the time was logged.
- Invoice numbering stays one counter per workspace (`INV-0001`…), shared by all members —
  the owner reads one sequence.
- `GET /v1/work/context` now carries the caller's own money view: rate in force today,
  workspace currency, their "from" block and the workspace "bill to" block.
  `PUT /v1/work/billing-details` saves the former.
- New member routes: `GET|POST /v1/work/invoices`, `POST /v1/work/invoices/preview`,
  `GET|PATCH|DELETE /v1/work/invoices/:iid`. The owner side keeps only
  `GET`, `PATCH`, `DELETE` — its `POST /invoices` and `/invoices/preview` are gone, as are
  all `/clients` routes.
- Reads and writes are scoped in SQL (`AND ($3 = '' OR user_id::text = $3)`), so a member
  cannot touch another member's invoice even with its id (404).

## Web-admin (owner)

- **Invoices** is now an inbox: number, **member**, issued, due, total, status. No "New
  invoice" button. The stat cards still read outstanding / overdue / paid this month /
  drafts — now money the workspace owes.
- **Invoice detail**: "From" is the member (name, login, their own block), "Bill to" is the
  workspace. Actions are mark paid / mark unpaid / void / print / delete a draft. Editing
  a draft is the member's job, in the app.
- **Projects** lost its Clients tab, client column and client dialog.
- Dead billing strings pruned from all 7 locales; `invoices.col.member`,
  `invoices.fromMember` and `invoices.draftNote` added to each.

## Desktop (member)

- New **Work → Invoices** screen (hidden when `/work/context` reports the caller is the
  owner of *that* workspace, who receives invoices instead — someone can own one team and
  be an employee in another):
  - stat cards — my rate, waiting for payment, paid this month, drafts;
  - **New invoice**: period, issue and due date, tax %, notes, with a live preview of the
    lines and total before anything is created;
  - my invoices, and one invoice rendered as the owner will see it (from / bill to /
    lines / totals), with **Send to the owner** and **Delete** on a draft;
  - **My details** — the "from" block printed on their invoices;
  - a notice when the owner hasn't set their rate yet (their time would bill at 0).
- `work_request` (Rust) now also allows **PATCH** — that is how a draft is submitted.
- The owner's native Projects screen lost its clients card and dialog; project, task and
  entry types lost `client_name` everywhere.
- New strings in all 7 locales (`tasks.json` → `invoice.*`, `common.json` → `nav.Invoices`);
  key sets verified equal across locales.

## Verified 2026-10-27

- **58-check HTTP end-to-end** against a throwaway Postgres 15 (`/tmp/ctr159-e2e.py`): the
  permission table above in both directions, preview scoping (another member's time, a
  non-billable project and a project-rate override), tax maths, numbering, locking,
  `409` when there is nothing left to bill, release of time on void / draft delete /
  owner clearing a draft, the member's own rate and "from" block round-tripping through
  `/work/context`, and family workspaces still refused billing (403). All pass.
- **Upgrade path**: a database left at migration 14 with a legacy client invoice (client,
  project with `client_id`, invoice + line, locked time) migrates to 15 cleanly — table
  gone, column gone, `user_id` NOT NULL, `memberships.billing_details` present, the
  invoice dropped and its time released; the owner's projects and entries still read back
  over HTTP. `goose down` then `up` on 15 also runs clean.
- `go build ./...`, `go vet ./...`, `go test ./...` (`NextStatus` tests rewritten for the
  role argument), `cargo check`, web-admin + desktop `tsc --noEmit` and `vite build`.

## Staging 2026-10-27 (build `20261027-165836`)

Deployed with `deploy/deploy.sh`; DB snapshot taken first
(`~/ctracking/snapshots/pre-159-20261027-165824.sql`).

- Migration 15 applied on Postgres 18 (goose 13 → 14 → **15**). It cleared the 6 clients
  and 4 legacy client invoices left from 157/158 QA and released their 5 locked entries;
  all 27 time entries survived.
- `/healthz` 200 (`20261027-165836`), marketing `/` and the `/admin` SPA shell both serve.
- Live flow over HTTPS as the QA accounts (member `ctr16stg1`, owner
  `ctr16-stg-owner@test.local`): `/work/context` carries the member's rate, currency and
  both blocks; the member saved a "from" block, previewed, raised **INV-0001** (rate not
  set yet → flagged, total 0), submitted it, and the owner marked it paid. Then the owner
  set the rate to 50.00/h, the member logged 3.5 h and raised **INV-0002** — 175.00 + 10 %
  tax = **192.50**, submitted, visible in the owner's inbox. The owner's `/clients` and
  `POST /invoices` routes are 404, the owner is refused on `/work/invoices` (403), and the
  member cannot void (409). No 5xx in the backend log.
- QA data left in place: workspace "CTR16 QA staging", INV-0001 (paid, 0) and INV-0002
  (sent, 192.50) — delete when QA is done.

## The real app, on staging (2026-10-27)

The checks above are HTTP; this one is the shipped UI. A staging build of the desktop
app (`--features staging`, x86_64, ad-hoc signed) was installed on the mac VPS
(`~/Applications/BiBoTracking Staging.app`), signed in as the QA member, and driven
through the whole flow. The VPS is headless, so `screencapture` only ever returns the
desktop picture — the app was read and clicked through the **accessibility tree**
instead (System Events, via Terminal's existing Accessibility grant; the SSH daemon
has none). What the app showed, step by step:

- Sidebar: `PERSONAL …` / **`WORK → Tasks, Invoices`**, and no Admin group — the member
  gate works against the live `/work/context` role.
- **Invoices**: "My rate US$50.00 per hour", "Waiting for payment US$192.50 · 1 invoices",
  "Paid US$0.00 this month", "Drafts 0"; the table listing INV-0002 (Sent, US$192.50) and
  INV-0001 (Paid, US$0.00).
- **New invoice** dialog: Time from/to, Issued, Due, Tax %, Notes, and a live preview
  built from the member's one unbilled hour — `Website · Sneaky — Member M`, US$50.00/h,
  1:00, **Total due US$50.00**.
- **Create draft** → the detail view: heading **INV-0003**, 2026-10-01 → 2026-10-27,
  **Draft**, the notice "Still a draft. Send it to the owner when it looks right.",
  **From** `Member M / ctr16stg1 / IBAN STG-159`, **Bill to** `CTR16 QA staging`, issued
  and due dates, and the line 1:00 × US$50.00 = US$50.00.
- **Send to the owner** → the same screen re-rendered as **Sent**.

The backend log shows exactly those calls from the app: `POST /v1/work/invoices` 201 →
`GET /v1/work/invoices/{id}` → **`PATCH /v1/work/invoices/{id}` 200** — so the PATCH that
`work_request` had to be taught (Rust) works in a real build. The owner's inbox then
reads `INV-0003 · Member M · sent · 50.00`, and the owner's detail view of it shows
From = the member with their own block, Bill to = the workspace.

Staging QA data now: INV-0001 (paid, 0), INV-0002 (sent, 192.50), INV-0003 (sent, 50.00,
made in the app). The app bundle is left installed on the VPS; it was quit afterwards and
its screenshot/keystroke capture was switched off for the whole run.

## Windows, on staging (2026-10-28)

Same staging build for Windows: `npx tauri build --target x86_64-pc-windows-msvc
--bundles nsis --features staging --config <staging conf with createUpdaterArtifacts
off>`, built on the LAN PC (`ssh winbuild`), producing
`BiBoTracking Staging_1.6.0_x64-setup.exe`. Installed silently (`/S`, per-user, no UAC)
to `%LOCALAPPDATA%\BiBoTracking Staging` with a Start Menu entry and an uninstall record
("BiBoTracking Staging 1.6.0"), then launched in the interactive session
(`schtasks … /it`) with the QA member's session preloaded.

- The sidebar shows **WORK → Tasks, Invoices**, and the **Invoices** screen renders:
  "My rate $50.00 per hour", "Waiting for payment $242.50 · 2 invoices", Paid $0.00 this
  month, Drafts 0 — and the table lists **INV-0003 ($50.00, Sent)** — the invoice raised
  from the macOS app — plus INV-0002 ($192.50, Sent) and INV-0001 ($0.00, Paid).
- The staging backend log shows the Windows app's `/v1/work/context`,
  `/v1/work/entries` and `/v1/sync/batch` calls, so the compile-time staging URL is right.
- Incidental: a stray click started a task timer; stopping it produced the app's own
  "Less than a minute of active time was recorded, so nothing was logged" notice — the
  active-time rule behaving on Windows too. One 1 m timer entry is left in the QA data.

Windows gotcha for future UI automation: PowerShell is DPI-unaware by default, so
`SystemInformation.VirtualScreen` reports 1536×864 while `SetCursorPos` works in the
physical 1920×1080 — call `SetProcessDPIAware()` first or every click lands ~20% off.

The PC keeps: the app installed and signed in as the QA member, with the previous
`stagingwindow` session and settings saved next to them as `*.ctr159.bak`.

## Not in this ticket

- Emailing invoices, PDF other than the browser's print, payroll, approvals of time.
- Printing an invoice from the desktop app (the owner prints from the web).
- Per-member invoice numbering (one workspace counter, so members share the sequence).
- Production: untouched. It also needs a **desktop release** for the Invoices screen —
  the API and web side work with the shipped desktop version (it just has no Invoices).
- The owner's web inbox rendered in a browser as the CTR16
  owner (the pages render — checked on another workspace — but the invoice detail page
  itself has only been read through the API).
