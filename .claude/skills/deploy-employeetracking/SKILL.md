---
name: deploy-employeetracking
description: Build and deploy the ctracking backend + marketing site + web admin to the macOS VPS, served at https://employeetracking.namnguyen.pro through the existing Cloudflare mac-vps tunnel. Cross-compiles the Go backend to Intel, stages the static marketing landing page at "/" and builds the web-admin SPA at "/admin" (both served by the backend, same origin), rsyncs everything, and restarts the launchd agent. Use whenever the user wants to deploy/ship/release/redeploy the backend, marketing site, or web admin, push changes to production, roll back, or check/operate the deployed service.
---

# Deploy ctracking (backend + marketing site + web admin) → employeetracking.namnguyen.pro

One Go binary serves the API **and** all static content (same origin). It runs
on a macOS VPS as a `launchd` user agent, talks to a local Postgres.app, and is
exposed over HTTPS by the existing **`mac-vps`** Cloudflare tunnel (no open ports).
The backend is pure Go (pgx, no CGO) so it cross-compiles to Intel from this Mac —
nothing is built on the VPS.

## What's served where (same origin)

| Path | Content | Source |
|---|---|---|
| `/` | Marketing landing page (static HTML/CSS/assets, screenshots + demo videos) | `marketing/site/` |
| `/admin`, `/admin/*` | Web-admin SPA (owner dashboard) — falls back to `admin/index.html` for client routes | `apps/web-admin/` (Vite `base: /admin/`) |
| `/download/EmployeeTracker-macOS.dmg` | Desktop app installer (Universal macOS) | staged by `build.sh` from the `build-desktop-dmg` output |
| `/v1/*`, `/healthz` | JSON API | `apps/backend/` |

The Go static handler is `staticSite` in `apps/backend/internal/server/server.go`:
real files win first, then `/admin/*` falls back to the SPA index, everything else
to the marketing index. On the VPS this all lives under `~/ctracking/web/`
(`index.html`, `styles.css`, `assets/`, and `admin/`).

## Facts (authoritative)

| Item | Value |
|---|---|
| Public URL | `https://employeetracking.namnguyen.pro` |
| VPS SSH | `namng@ssh.namnguyen.pro` (macOS 13 Ventura, Intel/x86_64) |
| App dir on VPS | `~/ctracking/` (`bin/`, `web/` = marketing root + `web/admin/` SPA, `storage/`, `logs/`, `.env`) |
| Backend port | `8080` (localhost; tunnel proxies 443→8080) |
| Service | LaunchAgent `pro.namnguyen.ctracking` (GUI domain, KeepAlive) |
| Plist | `~/Library/LaunchAgents/pro.namnguyen.ctracking.plist` |
| Logs | `~/ctracking/logs/{out,err}.log` |
| Postgres | Postgres.app 18 on `127.0.0.1:5432`, role+db `ctracking` (password auth) |
| Cloudflare tunnel | `mac-vps` (UUID `39dd671d-4ee2-45e6-bb70-81edee8c802c`), active config `/etc/cloudflared/config.yml` (root) |
| Deploy tooling | `deploy/` in the repo (`build.sh`, `setup-vps.sh`, `deploy.sh`) |
| Local config | `deploy/.env.deploy` (gitignored; copy from `.env.deploy.example`) |

## Routine deploy (the common case)

From the repo root:

```bash
deploy/deploy.sh
```

That script (via `deploy/build.sh`): cross-compiles the backend → stages
`marketing/site/` into `dist/web/` (the `/` root) → `pnpm` builds the web-admin into
`dist/web/admin/` → uploads `bin/` + `web/` via `rsync --delete` → writes
`~/ctracking/.env` (generating `JWT_SECRET` once, **preserving** it after) → (re)loads
the launchd agent into the GUI domain → restarts → checks `/healthz`. On success it
prints `Deployed. Health OK on port 8080.`

> `rsync --delete` on `web/` means stale marketing assets are pruned — so always
> deploy from a clean tree; don't hand-edit files under `~/ctracking/web/` on the VPS.

**IMPORTANT for the Claude Bash tool:** ssh/scp/rsync need network, so run deploy
commands with `dangerouslyDisableSandbox: true`. This is explicitly authorized
outward-facing work.

Verify from outside afterward — check all three surfaces:
```bash
B=https://employeetracking.namnguyen.pro
curl -s -o /dev/null -w "healthz %{http_code}\n"        "$B/healthz"
curl -s "$B/" | grep -q "Employee Tracker" && echo "marketing / OK"
curl -s "$B/admin" | grep -q '/admin/assets/' && echo "admin / OK"   # SPA shell loads
curl -s -o /dev/null -w "api %{http_code}\n"            "$B/v1/public/businesses"
```
A quick visual pass (Playwright) on `/` and `/admin` catches render-time bugs the
curl checks miss — e.g. a wrong router `basename` shows a blank `/admin` while the
HTML still 200s (see Gotchas).

## One-time prerequisites (already done on this VPS; redo only on a fresh host)

1. **`deploy/.env.deploy`** — `cp deploy/.env.deploy.example deploy/.env.deploy` and fill
   `VPS_HOST`, `REMOTE_DIR=ctracking`, `PORT=8080`,
   `DATABASE_URL=postgres://ctracking:<pw>@127.0.0.1:5432/ctracking?sslmode=disable`,
   `PUBLIC_ORIGIN=https://employeetracking.namnguyen.pro`.

2. **Postgres role + database (GUI step).** Postgres.app gates `trust` auth behind a
   GUI permission dialog, so create the role from a **VPS GUI Terminal** (approve the
   dialog if it pops):
   ```bash
   /Applications/Postgres.app/Contents/Versions/18/bin/psql -d postgres <<'SQL'
   CREATE ROLE ctracking LOGIN PASSWORD '<choose-one>';
   CREATE DATABASE ctracking OWNER ctracking;
   SQL
   ```
   `setup-vps.sh` then adds a `pg_hba.conf` rule so this role uses **password** auth
   (no dialog) and `pg_ctl reload`s it — that part is automated over SSH.

3. **Cloudflare tunnel ingress** for `employeetracking.namnguyen.pro → http://localhost:8080`.
   - DNS route (no sudo, runnable over SSH): `/usr/local/bin/cloudflared tunnel route dns mac-vps employeetracking.namnguyen.pro`.
   - Ingress edit + restart need **sudo with a real TTY** — they CANNOT go through the
     Claude Bash tool. Give the user these to paste in their VPS terminal:
     ```bash
     sudo python3 ~/.claude/skills/expose-via-cloudflare-tunnel/scripts/add-ingress.py \
         employeetracking.namnguyen.pro http://localhost:8080
     sudo /usr/local/bin/cloudflared --config /etc/cloudflared/config.yml tunnel ingress validate
     sudo launchctl kickstart -k system/com.cloudflare.cloudflared
     ```
     If validate fails, restore and stop: `sudo cp /etc/cloudflared/config.yml.bak /etc/cloudflared/config.yml`.
   - See the host's own `expose-via-cloudflare-tunnel` skill for full tunnel details.
     Do NOT use `~/Work/restart-tunnel.sh` (it's hard-coded to the *openclaw* rule).

## Operate

```bash
# logs
ssh namng@ssh.namnguyen.pro 'tail -n 50 ~/ctracking/logs/err.log'
# restart
ssh namng@ssh.namnguyen.pro 'launchctl kickstart -k gui/$(id -u)/pro.namnguyen.ctracking'
# stop / start
ssh namng@ssh.namnguyen.pro 'launchctl bootout   gui/$(id -u)/pro.namnguyen.ctracking'
ssh namng@ssh.namnguyen.pro 'launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/pro.namnguyen.ctracking.plist'
```

## Rollback

`deploy.sh` overwrites `bin/` and `web/` (marketing **and** `web/admin/`). To roll
back, check out the previous repo commit and re-run `deploy/deploy.sh`. Uploaded
screenshots in `~/ctracking/storage/` are never deleted by rsync.

## Gotchas

- **Cloudflare edge-caches static assets; the HTML is fresh.** The site sits behind the
  `mac-vps` Cloudflare tunnel. Responses for `/` are `cf-cache-status: DYNAMIC` (fresh
  every request), but static files (`.css`, `.js`, images, video) are edge-cached for
  hours (`cache-control: max-age=14400`, `cf-cache-status: HIT`). Because filenames are
  stable across deploys, **a redeploy updates the origin file but Cloudflare keeps
  serving the old one** — classic symptom: new HTML markup + old CSS = broken/unstyled
  layout that no amount of browser refreshing fixes.
  - **Fix in place:** `build.sh` stamps `?v=$VERSION` onto the `styles.css` link in the
    deployed `index.html` (a new URL → edge cache miss → fresh CSS). Fresh HTML means
    users pick it up immediately. Other churning assets need the same treatment.
  - **Diagnose before assuming the deploy failed.** Compare the *served* asset to origin:
    ```bash
    B=https://employeetracking.namnguyen.pro
    curl -sI "$B/styles.css" | grep -iE 'cf-cache-status|age:|cache-control'   # edge state
    curl -s  "$B/styles.css?bust=$(date +%s)" | grep -c 'your-new-rule'        # origin truth
    ```
    If the cache-busted fetch has your change but the plain one doesn't, it's stale-cache,
    not a bad deploy. **Lesson: behind a CDN, verify the served asset, not just the file
    on disk — same-filename overwrites are invisible to the edge.**
  - If you swap an image/video for different content under the *same* filename, it'll go
    stale too — version it (or content-hash the name), don't just re-upload.
- **First request after a tunnel/daemon restart can take ~50s** (slow home-router DNS
  for `*.argotunnel.com`). Retry a few times before declaring failure.
- **`JWT_SECRET` must stay stable** — `setup-vps.sh` preserves it; if it ever changes,
  all existing sessions are invalidated.
- **launchd must target the GUI domain** (`gui/$(id -u)`); a plain `launchctl load`
  over SSH loads into the wrong session.
- **Desktop app** default `backend_url` is `https://employeetracking.namnguyen.pro`
  (see `apps/desktop/src-tauri/src/settings/mod.rs`); an existing local install keeps
  whatever is already in its `settings.json`.
- The web-admin build uses **same-origin** relative `/v1` (no `VITE_API_BASE`), so it
  only works when served by the backend (prod) or via the Vite dev proxy.
- **Web-admin lives under `/admin`.** Two pieces must agree: Vite `base: "/admin/"`
  (`apps/web-admin/vite.config.ts`) and the React Router `basename` in
  `apps/web-admin/src/App.tsx`. The router uses
  `basename={import.meta.env.BASE_URL.replace(/\/+$/, "")}` → `/admin` (**no** trailing
  slash). With a trailing slash, visiting `/admin` (no slash) matches nothing and
  renders a **blank page** — HTML still returns 200, so always verify `/admin` renders,
  not just its status code. The API stays at root `/v1`, unaffected by the base.
- **Marketing site is plain static** (`marketing/site/`: `index.html`, `styles.css`,
  `assets/`). No build step — `build.sh` just copies it to the web root. Its
  reveal-on-scroll animations are opt-in via a JS-added `html.anim` class, so content
  is visible without JS / to crawlers. Update content by editing the source and
  redeploying; don't edit on the VPS (rsync `--delete` will revert it).
- **Bare domain now lands on marketing, not login.** Owners reach the dashboard at
  `/admin`; their session token is `localStorage` on the same origin, so an existing
  login still auto-resumes at `/admin`.
- **DMG download** is served at a stable `/download/EmployeeTracker-macOS.dmg`.
  `build.sh` copies the newest `*_universal.dmg` from
  `apps/desktop/src-tauri/target/universal-apple-darwin/release/bundle/dmg/` into
  `dist/web/download/`. So the link only refreshes when you've built the DMG locally
  first (`build-desktop-dmg` skill) — if none exists, build.sh prints a WARNING and the
  link 404s. The DMG ships inside `web/` so it survives the `rsync --delete`. After a
  desktop release, rebuild the DMG then redeploy to publish it.
