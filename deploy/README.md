# Deploy (macOS VPS, no Docker)

Ships the Go backend (which also serves the built web-admin SPA) to a macOS host and
runs it as a `launchd` user agent. The backend is pure Go (pgx, no CGO) so it
cross-compiles to Intel from Apple Silicon — nothing to build on the VPS.

## Target assumptions
- macOS (Intel here), Xcode CLT, `rsync` + `curl` present.
- **PostgreSQL already running** (this host uses Postgres.app 18 on `127.0.0.1:5432`).
- No root needed: app lives in `~/ctracking`, runs as a user LaunchAgent.

## One-time prerequisites

1. **Create the DB role + database** (GUI step — Postgres.app gates `trust` auth
   behind a permission dialog). On the VPS GUI Terminal:
   ```bash
   /Applications/Postgres.app/Contents/Versions/18/bin/psql -d postgres <<'SQL'
   CREATE ROLE ctracking LOGIN PASSWORD 'your-strong-password';
   CREATE DATABASE ctracking OWNER ctracking;
   SQL
   ```
   `setup-vps.sh` then adds a `pg_hba.conf` rule so this role authenticates by
   password (no dialog) — that part is automated.

2. **Local config:** `cp deploy/.env.deploy.example deploy/.env.deploy` and fill in
   `VPS_HOST`, `DATABASE_URL` (with the password above), `PORT`, `PUBLIC_ORIGIN`.

## Deploy
```bash
deploy/deploy.sh
```
This builds, uploads (`rsync`), writes `~/ctracking/.env` (generating a stable
`JWT_SECRET` once), installs the LaunchAgent, restarts it, and checks `/healthz`.

## Layout on the VPS
```
~/ctracking/
  bin/ctracking-server     # the binary
  web/                     # built web-admin (served at /)
  storage/screenshots/     # uploaded screenshots (never rsync-deleted)
  logs/{out,err}.log
  .env                     # PORT, DATABASE_URL, JWT_SECRET, STORAGE_DIR, STATIC_DIR
~/Library/LaunchAgents/pro.namnguyen.ctracking.plist
```

## Operate
```bash
# logs
ssh <host> 'tail -f ~/ctracking/logs/err.log'
# restart / stop
ssh <host> 'launchctl kickstart -k gui/$(id -u)/pro.namnguyen.ctracking'
ssh <host> 'launchctl unload ~/Library/LaunchAgents/pro.namnguyen.ctracking.plist'
```

## Notes / follow-ups
- **HTTP only.** Tokens and screenshots cross the network in cleartext. Put a TLS
  reverse proxy in front before real use (Caddy with auto-HTTPS, or a Cloudflare
  Tunnel) and point `PUBLIC_ORIGIN` / the desktop `backend_url` at `https://…`.
- **Port reachability.** Ensure `PORT` is open to clients (firewall / router), or
  front it with the proxy above.
- **Desktop app:** set its `backend_url` to the public origin so employees sync here.
- **LaunchAgent** runs in the user's GUI login session — fine for an auto-login Mac
  VPS. For login-independent running, convert to a LaunchDaemon (needs root).
