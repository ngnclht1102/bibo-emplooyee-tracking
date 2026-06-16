#!/usr/bin/env bash
# Runs ON the VPS (over SSH). Idempotent. Prepares directories, Postgres password
# auth (Postgres.app), the .env, and the launchd user agent. Does NOT create the
# DB role/database — that's a one-time GUI step (see deploy/README.md).
#
# Expects env: REMOTE_DIR DATABASE_URL [PORT] [PUBLIC_ORIGIN] [PG_VERSION]
set -euo pipefail

APP="$HOME/${REMOTE_DIR:?REMOTE_DIR required}"
PORT="${PORT:-8080}"
PGV="${PG_VERSION:-18}"
PGBIN="/Applications/Postgres.app/Contents/Versions/$PGV/bin"
DD="$HOME/Library/Application Support/Postgres/var-$PGV"
PLIST="$HOME/Library/LaunchAgents/pro.namnguyen.ctracking.plist"

mkdir -p "$APP/bin" "$APP/web" "$APP/storage/screenshots" "$APP/logs"

# --- Postgres: password auth for the ctracking role (bypasses Postgres.app's
#     trust-auth GUI dialog so the headless service can connect). ---
HBA="$DD/pg_hba.conf"
if [ -f "$HBA" ] && ! grep -q "ctracking    ctracking" "$HBA"; then
  cp "$HBA" "$HBA.bak.ctracking"
  {
    printf 'host    ctracking    ctracking    127.0.0.1/32    scram-sha-256\n'
    printf 'host    ctracking    ctracking    ::1/128         scram-sha-256\n'
    cat "$HBA.bak.ctracking"
  } > "$HBA.new"
  mv "$HBA.new" "$HBA"
  "$PGBIN/pg_ctl" reload -D "$DD" >/dev/null 2>&1 || kill -HUP "$(head -1 "$DD/postmaster.pid")" || true
  echo "  pg_hba: password rule added + reloaded"
else
  echo "  pg_hba: rule already present"
fi

# --- .env (generate JWT_SECRET once; preserve it across redeploys so tokens stay valid) ---
ENVF="$APP/.env"
if [ -f "$ENVF" ] && grep -q '^JWT_SECRET=' "$ENVF"; then
  JWT="$(grep '^JWT_SECRET=' "$ENVF" | head -1 | cut -d= -f2-)"
else
  JWT="$(openssl rand -hex 32)"
fi
cat > "$ENVF" <<EOF
PORT=$PORT
DATABASE_URL=${DATABASE_URL:?DATABASE_URL required}
JWT_SECRET=$JWT
STORAGE_DIR=./storage
STATIC_DIR=./web
WEB_ADMIN_ORIGIN=${PUBLIC_ORIGIN:-http://localhost:$PORT}
EOF
chmod 600 "$ENVF"
echo "  .env written ($ENVF)"

# --- launchd user agent (RunAtLoad + KeepAlive) ---
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>pro.namnguyen.ctracking</string>
  <key>ProgramArguments</key><array><string>$APP/bin/ctracking-server</string></array>
  <key>WorkingDirectory</key><string>$APP</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$APP/logs/out.log</string>
  <key>StandardErrorPath</key><string>$APP/logs/err.log</string>
</dict></plist>
EOF
echo "  launchd plist written ($PLIST)"
echo "setup complete: $APP"
