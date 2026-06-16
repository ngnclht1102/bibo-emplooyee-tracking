#!/usr/bin/env bash
# Build locally, upload to the VPS, and (re)start the launchd service.
# Config + secrets come from deploy/.env.deploy (gitignored; see .env.deploy.example).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -f "$ROOT/.env.deploy" ] || { echo "Missing $ROOT/.env.deploy (copy .env.deploy.example)"; exit 1; }
# shellcheck disable=SC1091
source "$ROOT/.env.deploy"   # VPS_HOST REMOTE_DIR PORT DATABASE_URL PUBLIC_ORIGIN
: "${VPS_HOST:?}" "${REMOTE_DIR:?}" "${PORT:?}" "${DATABASE_URL:?}"
DIST="$ROOT/dist"

"$ROOT/build.sh"

echo "==> Preparing remote ($VPS_HOST:~/$REMOTE_DIR)…"
ssh "$VPS_HOST" "mkdir -p ~/$REMOTE_DIR"
scp -q "$ROOT/setup-vps.sh" "$VPS_HOST:$REMOTE_DIR/setup-vps.sh"
ssh "$VPS_HOST" "REMOTE_DIR='$REMOTE_DIR' DATABASE_URL='$DATABASE_URL' PORT='$PORT' PUBLIC_ORIGIN='${PUBLIC_ORIGIN:-}' bash $REMOTE_DIR/setup-vps.sh"

echo "==> Uploading binary + web…"
rsync -az --delete "$DIST/bin/"  "$VPS_HOST:$REMOTE_DIR/bin/"
rsync -az --delete "$DIST/web/"  "$VPS_HOST:$REMOTE_DIR/web/"

echo "==> Restarting service…"
ssh "$VPS_HOST" "
  set -e
  PL=\"\$HOME/Library/LaunchAgents/pro.namnguyen.ctracking.plist\"
  DOM=gui/\$(id -u)
  # Load into the GUI session (persists with the user's login), with a legacy fallback.
  launchctl bootout \$DOM/pro.namnguyen.ctracking 2>/dev/null || true
  launchctl bootstrap \$DOM \"\$PL\" 2>/dev/null || launchctl load \"\$PL\" 2>/dev/null || true
  launchctl kickstart -k \$DOM/pro.namnguyen.ctracking 2>/dev/null || true
  sleep 2
  curl -fsS localhost:$PORT/healthz && echo || { echo '--- err.log ---'; tail -20 ~/$REMOTE_DIR/logs/err.log; exit 1; }
"
echo "==> Deployed. Health OK on port $PORT."
