# BiBoTracking — project guide

Local-first employee/family **time & activity tracking**. A desktop app captures
activity on each machine and (optionally) syncs to a backend; owners review it in a web
dashboard. Open-source, self-hostable, positioned as a Hubstaff alternative.

> **Brand:** display name is **BiBoTracking** (renamed from "BiBoEmployeeTracking", ticket
> 111 — display only). Build/infra identifiers still use older names: Tauri
> `productName=employeetrack`, bundle id `com.briannguyen.ctracking`, Go module
> `ctracking/backend`, DMG `EmployeeTracker-macOS.dmg`, Chrome ext slug `employee-tracker`.
> Don't "fix" those unless doing an infra rebrand.

## Monorepo layout (pnpm workspace: `apps/*`, `packages/*`)
- `apps/backend` — Go API + static file server (one binary serves API **and** all static
  content, same origin). Module `ctracking/backend`. Gin + pgx (no CGO) + Postgres.
- `apps/web-admin` — React 19 + Vite SPA, owner dashboard. Served at **`/admin`**
  (Vite `base: "/admin/"`, router `basename=/admin`). Dev port **5174**.
- `apps/desktop` — Tauri 2 (Rust) + React/Vite. The tracker app (macOS + Windows).
- `apps/extension` — Chrome MV3 extension; reports browser activity to the **local** app
  (`127.0.0.1`), never the cloud.
- `marketing/` — static landing site (see i18n build below).
- `docs/` — design docs + `docs/tickets/` (numbered work log; `00-INDEX.md` is the index).
- `deploy/` — deploy scripts (**gitignored**, local-only). `.claude/skills/` — also local-only.

## Run locally (scripts/)
- `scripts/dev-db.sh` — Postgres in Docker (`ctracking-dev-db`, role/db `ctracking`, :5432).
  NOTE: a native Postgres.app can squat :5432 — only one can run at a time.
- `scripts/dev-backend.sh` — Go backend on **:8080** (auto-runs goose migrations). Needs
  `apps/backend/.env` (auto-copied from `.env.example`).
- `scripts/dev-web.sh` — web-admin on `:5174/admin/` (Vite proxies `/v1` → :8080).
- `scripts/dev-desktop.sh` — `tauri dev`; sets `CTRACKING_BACKEND_URL=http://localhost:5174`.

## Auth & data model (backend)
- Postgres; migrations in `apps/backend/internal/db/migrations` (goose, embedded, run on
  startup). Latest = `00007_member_username.sql`.
- `users` (email **and/or** username — either is a login identifier; ≥1 required),
  `businesses` (kind `team|family`), `memberships` (role `owner|employee`, unique per
  user+business), `devices`, activity/screenshot/browser tables.
- **Login by identifier:** `GetUserByIdentifier` matches email OR username; `/v1/auth/login`
  takes `identifier` (legacy `email` field still accepted). Owners can self-register with
  username or email too (ticket 104).
- **Owner self-tracking (ticket 105):** report queries include `role IN ('owner','employee')`
  so an owner's own activity shows in their dashboard (marked "You"). Ownership scoping is
  still enforced (`b.owner_user_id = caller`).
- Persona vocab (employee/kid, team/family) centralized in web `src/terms.ts` (localized).

## i18n (tickets 106–110) — 7 locales: `en, zh, ja, vi, id, fr, es`
- `zh` = Simplified Chinese. Stack: `i18next` + `react-i18next` + browser language detector;
  JSON catalogs per app under `src/i18n/locales/<code>/<namespace>.json`. Persisted in
  `localStorage` (key `locale`); detection: saved → browser → `en`.
- Brand "BiBoTracking" stays verbatim in all locales. Formatting via `Intl` (`format.ts`).
- **Desktop native:** Rust tray/menu localized via a `tr(locale,key)` table reading
  `settings.locale`; `set_locale` command + `LanguageSwitcher` mirror the choice. Permission
  labels render from the React `permissions.caps.<key>` catalog (Rust strings as fallback).
- **Marketing:** generated, NOT hand-edited. Edit `marketing/src/template.html` +
  `marketing/src/i18n/<code>.json` (185 keys), then `node marketing/build.mjs` → emits
  `marketing/site/index.html` (en) + `site/<code>/index.html` + `sitemap.xml`, with
  per-locale `lang`/canonical/hreflang/OG/JSON-LD. Status: 107/108/109 done; **110 (native
  review) pending**.

## Environments (ticket 112) — local / staging / production
| Env | Backend |
|---|---|
| local | `http://localhost:8080` |
| staging | `https://staging.example.com` |
| production | `https://bibotracker.com` (**LIVE** on Ubuntu VPS `root@vinahost` via Cloudflare Tunnel; verified e2e 2026-06-21) |
- **web-admin:** `VITE_API_BASE` via Vite modes — `npm run dev` (local, proxy), `build:staging`
  (`.env.staging`), `build:prod` (`.env.prod`); default `build` = same-origin (empty base).
- **desktop:** compile-time Cargo features in `src-tauri/Cargo.toml` (`local|staging|production`,
  default **production**) pick `DEFAULT_BACKEND_URL` (`settings/mod.rs`, order local>staging>prod);
  `CTRACKING_BACKEND_URL` env overrides at runtime.
- **Deploy skills** (local-only `.claude/skills/`): `deploy-staging` (live, employeetracking,
  macOS/launchd/Cloudflare-tunnel), `deploy-production` (live pipeline → bibotracker.com on
  Ubuntu VPS `root@vinahost`: Go binary + PG16 + **Cloudflare Tunnel**, systemd, no nginx;
  `deploy/deploy-prod.sh`). `build-desktop-dmg` / `build-desktop-exe` build the installers.

## Conventions
- Tickets: every change is logged in `docs/tickets/NN-*.md` (+ `00-INDEX.md`); QA tickets are
  interactive (human runs the app). Highest ticket so far: 114.
- Verify before claiming done: web/desktop `tsc --noEmit` + `vite build`; backend `go build ./...`;
  Rust `cargo check` (in `apps/desktop/src-tauri`).
- After backend code changes the `go run` dev server must be **restarted** (no hot reload).
- Git: commits go on `main` (project's pattern). See the user's global rules for commit style.
