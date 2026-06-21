# 114 — Production provisioned on bibotracker.com (Cloudflare Tunnel)

**Status: Done** — production is live and verified end-to-end on 2026-06-21.

Builds on ticket 112 (three environments). 112 left `deploy-production` as a PLACEHOLDER
and assumed the domain `bibotracking.com`. This ticket stands production up for real and
**corrects the domain**.

## Domain correction: bibotracking.com → bibotracker.com
`bibotracking.com` was never registered (whois: "No match"). The domain actually owned on
the Cloudflare account (`Brian.nguyen.work@gmail.com`) is **`bibotracker.com`**. All
code/docs were updated:
- `apps/desktop/src-tauri/src/settings/mod.rs` — production `DEFAULT_BACKEND_URL` + its test.
- `apps/web-admin/.env.prod` (`VITE_API_BASE`) + `.env.example` / `apps/backend/.env.prod.example` comments.
- `deploy/.env.deploy.prod` (`PUBLIC_ORIGIN`), `deploy/deploy-prod.sh`, `deploy-production` skill, CLAUDE.md.
- **Unchanged on purpose:** the desktop bundle id `com.briannguyen.bibotracking` (ticket 113) —
  that's an app identifier, not the web domain.

## Infra (differs from staging in every dimension)
| | Staging | Production (this ticket) |
|---|---|---|
| Host | macOS VPS | **Ubuntu 24.04** `root@vinahost` (123.30.140.213, ~1 GB RAM) |
| Init | launchd | **systemd** (`bibotracking.service`) |
| Postgres | Postgres.app 18 | **PG16** (apt), role+db `ctracking` |
| Edge | Cloudflare tunnel (`mac-vps`) | **Cloudflare tunnel** (token-managed connector) |
| Reverse proxy | — | **none** (no nginx; tunnel → `127.0.0.1:8080` directly) |

- The old box was **CentOS 7** with Postgres **9.2** (incompatible — app needs
  `gen_random_uuid`/`ON CONFLICT`, PG ≥9.5). It was backed up (nginx + childrenpoints DB +
  jar) and **reinstalled to Ubuntu 24.04** before this work.
- App at `/opt/bibotracking/{bin,web,storage,logs,.env}`, system user `bibotracking`.
- `ufw` active (incoming deny + OpenSSH only) → backend `:8080` is **not** publicly exposed;
  reachable only via the tunnel over loopback.
- Architecture chosen as **Option B** (tunnel, no nginx) over nginx+origin-cert (A) and
  Go-serves-443 (C): matches staging, no origin cert, hides origin IP, built-in host routing
  for future multi-app (childrenpoints).

## Deploy tooling (new, Linux — staging's `deploy/*.sh` are macOS-only)
`deploy/build-prod.sh` (linux/amd64 + web-admin same-origin + marketing), `setup-vps-prod.sh`
(idempotent: PG16 + cloudflared + role/db + user + `.env` [JWT once] + systemd + tunnel +
ufw), `deploy-prod.sh` + `.env.deploy.prod` (gitignored). Routine deploy = `deploy/deploy-prod.sh`.

## Verification (e2e through Cloudflare)
`https://bibotracker.com` → `/healthz` 200, `/` marketing "BiBoTracking", `/admin` SPA loads,
`/v1/public/businesses` 200; `server: cloudflare`. Migrations applied to goose v7 on PG16.

## Follow-ups
- [ ] Desktop `cargo check` on next desktop build (production URL literal changed; test updated).
- [ ] Restore childrenpoints on the same box (Java jar — needs JVM heap cap on 1 GB).
- [ ] `bibotracking.com` is NOT ours — if brand-matching is wanted later, register it and add a
      second tunnel public hostname / redirect.
