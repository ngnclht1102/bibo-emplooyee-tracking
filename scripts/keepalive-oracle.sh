#!/usr/bin/env bash
# keepalive-oracle.sh — keeps the Oracle Always Free A1 box above the idle
# reclamation threshold by calling the token-gated, CPU-heavy keep-alive endpoint.
#
# Oracle reclaims an Always Free instance only if, over a rolling 7 days, the 95th
# percentile of CPU AND network AND memory are ALL < 20%. One POST here spins every
# OCPU on argon2id for ~30s, so a single call per run breaks the CPU rule. It changes
# no data and is NOT rate-limited (unlike /v1/auth/*).
#
# Run from the Mac VPS (ssh.namnguyen.pro) via cron, e.g. every 10 minutes:
#   */10 * * * * KEEPALIVE_TOKEN=xxxx /path/to/keepalive-oracle.sh
#
# Configure via env:
#   KEEPALIVE_API     base URL of the Oracle API   (default: https://bibotracker.com)
#   KEEPALIVE_TOKEN   secret matching backend KEEPALIVE_TOKEN   (REQUIRED)
#   KEEPALIVE_SECONDS server-side burn seconds, 1..120   (default: 120)
#   KEEPALIVE_PERCENT target CPU load %, 10..85           (default: 60)
#   KEEPALIVE_LOG     log file path
set -uo pipefail

API="${KEEPALIVE_API:-https://bibotracker.com}"
TOKEN="${KEEPALIVE_TOKEN:?set KEEPALIVE_TOKEN to the secret configured on the backend}"
SECONDS_BURN="${KEEPALIVE_SECONDS:-120}"
PERCENT="${KEEPALIVE_PERCENT:-60}"
LOG="${KEEPALIVE_LOG:-$HOME/Library/Logs/keepalive-oracle.log}"

mkdir -p "$(dirname "$LOG")"
ts(){ date "+%Y-%m-%dT%H:%M:%S%z"; }

# -m must exceed the server burn time so curl doesn't hang up mid-work.
timeout=$(( SECONDS_BURN + 30 ))
resp=$(curl -s -w '\n%{http_code}' -m "$timeout" \
  -X POST "$API/v1/keepalive?seconds=$SECONDS_BURN&percent=$PERCENT" \
  -H "X-Keepalive-Token: $TOKEN")
code=$(printf '%s' "$resp" | tail -n1)
body=$(printf '%s' "$resp" | sed '$d' | tr -d '\n')

echo "$(ts) HTTP $code -> $API ($body)" >> "$LOG"
[ "$code" = "200" ] || exit 1
