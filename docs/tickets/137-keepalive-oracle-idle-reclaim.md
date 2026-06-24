# 137 — Keep-alive endpoint to stop Oracle Always Free idle reclamation

## Problem
The Oracle Always Free A1.Flex prod box (2 OCPU / 12 GB) is reclaimed if, over a
rolling 7 days, the 95th percentile of CPU **and** network **and** memory are all
< 20%. Breaking CPU alone is enough. We want to drive load with a real API call from
the Mac VPS (`ssh.namnguyen.pro`) on a cron.

The obvious lever — wrong-password `POST /v1/auth/login` (argon2id is CPU-heavy) —
does **not** work here: the whole `/v1/auth` group is wrapped in `LoginRateLimit()`
(~1 req/s per IP, burst 5), so a single source IP gets `429`ed before hashing runs.

## Solution
New token-gated, **un-rate-limited**, side-effect-free endpoint:

- `POST /v1/keepalive?seconds=30` — header `X-Keepalive-Token: <secret>`.
- Spins `runtime.NumCPU()` goroutines running argon2id (t=1, 64 MiB, p=4) until the
  deadline; pegs both OCPUs. `seconds` default 30, capped 120.
- Gated by `KEEPALIVE_TOKEN` env (constant-time compare). Route is only registered
  when the token is set, so it's invisible on local/staging.

### Files
- `apps/backend/internal/handlers/keepalive.go` — handler.
- `apps/backend/internal/server/server.go` — route under `/v1` (not `/auth`).
- `apps/backend/internal/config/config.go` + `.env.example` — `KEEPALIVE_TOKEN`.
- `scripts/keepalive-oracle.sh` — Mac-side caller for cron.

## Cadence
95th-pct CPU ≥ 20% needs ≥ ~5% of samples busy ≈ ~505 min/week. Run the script
**every 10 min** (`*/10 * * * *`) → ~1000 busy-min/week, ~2× margin. A 2-day cron
would NOT save the box.

## Deploy / install (manual)
1. Set `KEEPALIVE_TOKEN=<secret>` in the prod backend env on Oracle, redeploy
   (`deploy-oracle`), restart service.
2. On `ssh.namnguyen.pro`, crontab:
   `*/10 * * * * KEEPALIVE_TOKEN=<secret> /path/to/keepalive-oracle.sh`
3. Verify: `curl -s -X POST https://bibotracker.com/v1/keepalive?seconds=5 -H "X-Keepalive-Token: <secret>"`
   → `{"ok":true,"cpus":2,...}`; watch CPU in the OCI console over a day.
