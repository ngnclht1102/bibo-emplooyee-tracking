---
name: deploy-employeetracking
description: Build and deploy the ctracking backend + web admin to the macOS VPS, served at https://employeetracking.namnguyen.pro through the existing Cloudflare mac-vps tunnel. Cross-compiles the Go backend to Intel, builds the web-admin SPA (served by the backend, same origin), rsyncs both, and restarts the launchd agent. Use whenever the user wants to deploy/ship/release/redeploy the backend or web admin, push changes to production, roll back, or check/operate the deployed service.
---

# Deploy ctracking (backend + web admin) → employeetracking.namnguyen.pro

One Go binary serves the API **and** the built web-admin SPA (same origin). It runs
on a macOS VPS as a `launchd` user agent, talks to a local Postgres.app, and is
exposed over HTTPS by the existing **`mac-vps`** Cloudflare tunnel (no open ports).
The backend is pure Go (pgx, no CGO) so it cross-compiles to Intel from this Mac —
nothing is built on the VPS.

## Facts (authoritative)

| Item | Value |
|---|---|
| Public URL | `https://employeetracking.namnguyen.pro` |
| VPS SSH | `namng@ssh.namnguyen.pro` (macOS 13 Ventura, Intel/x86_64) |
| App dir on VPS | `~/ctracking/` (`bin/`, `web/`, `storage/`, `logs/`, `.env`) |
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

That script: builds (cross-compile backend + `pnpm` build web-admin) → uploads the
binary + `web/` via `rsync` → writes `~/ctracking/.env` (generating `JWT_SECRET` once,
**preserving** it after) → (re)loads the launchd agent into the GUI domain → restarts →
checks `/healthz`. On success it prints `Deployed. Health OK on port 8080.`

**IMPORTANT for the Claude Bash tool:** ssh/scp/rsync need network, so run deploy
commands with `dangerouslyDisableSandbox: true`. This is explicitly authorized
outward-facing work.

Verify from outside afterward:
```bash
curl -s -w "\n%{http_code}\n" https://employeetracking.namnguyen.pro/healthz
```

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

`deploy.sh` overwrites `bin/` and `web/`. To roll back, check out the previous repo
commit and re-run `deploy/deploy.sh`. Uploaded screenshots in `~/ctracking/storage/`
are never deleted by rsync.

## Gotchas

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
