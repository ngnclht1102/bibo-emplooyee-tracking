#!/usr/bin/env bash
# Start one ENVIRONMENT (dev | staging | production) of the local full stack.
#
# Each environment is fully isolated:
#   - its own Postgres database  (ctracking / ctracking_staging / ctracking_prod)
#   - its own backend port        (8080 / 8081 / 8082)
#   - its own desktop build        distinct bundle id + name + ribbon icon, so all
#                                  three apps install & run side by side.
#
# Usage:
#   scripts/start-env.sh <dev|staging|production> [backend|desktop|all]
#
#   component defaults to "all": brings the DB up, starts the backend in the
#   background, then runs the matching desktop build in the foreground (tauri dev).
#   Ctrl-C stops the desktop and tears the backend down.
#
# Examples:
#   scripts/start-env.sh dev            # full dev stack
#   scripts/start-env.sh staging backend
#   scripts/start-env.sh production desktop
set -euo pipefail

ENV="${1:-}"
COMPONENT="${2:-all}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

case "$ENV" in
  dev|local)
    ENV=dev
    FEATURE=local
    DB=ctracking
    PORT=8080
    TAURI_CONFIG="tauri.dev.conf.json"
    JWT_SECRET="dev-only-change-me"
    STORAGE_DIR="./storage"
    ;;
  staging)
    FEATURE=staging
    DB=ctracking_staging
    PORT=8081
    TAURI_CONFIG="tauri.staging.conf.json"
    JWT_SECRET="staging-only-change-me"
    STORAGE_DIR="./storage-staging"
    ;;
  production|prod)
    ENV=production
    FEATURE=production
    DB=ctracking_prod
    PORT=8082
    TAURI_CONFIG=""           # production uses the base tauri.conf.json
    JWT_SECRET="prod-change-me-to-a-long-random-secret"
    STORAGE_DIR="./storage-prod"
    ;;
  *)
    echo "usage: $0 <dev|staging|production> [backend|desktop|all]" >&2
    exit 2
    ;;
esac

case "$COMPONENT" in
  backend|desktop|all) ;;
  *) echo "component must be backend|desktop|all (got '$COMPONENT')" >&2; exit 2 ;;
esac

BACKEND_URL="http://localhost:$PORT"
DATABASE_URL="postgres://ctracking:ctracking@localhost:5432/$DB?sslmode=disable"

echo "╶─ environment: $ENV"
echo "   database   : $DB"
echo "   backend    : $BACKEND_URL"
echo "   desktop    : feature=$FEATURE  config=${TAURI_CONFIG:-tauri.conf.json}"
echo

start_backend() {
  echo "→ ensuring Postgres (+ per-env databases) is up"
  "$ROOT/scripts/dev-db.sh" >/dev/null

  cd "$ROOT/apps/backend"
  echo "→ backend ($ENV) on $BACKEND_URL  ·  db=$DB"
  # Exported vars win over any committed .env (godotenv does not override the
  # process environment), so we never clobber the developer's local .env file.
  PORT="$PORT" \
  DATABASE_URL="$DATABASE_URL" \
  JWT_SECRET="$JWT_SECRET" \
  STORAGE_DIR="$STORAGE_DIR" \
    go run ./cmd/server
}

start_desktop() {
  cd "$ROOT/apps/desktop"
  local cfg_args=()
  [[ -n "$TAURI_CONFIG" ]] && cfg_args=(--config "src-tauri/$TAURI_CONFIG")
  export CTRACKING_BACKEND_URL="$BACKEND_URL"
  echo "→ desktop ($ENV) → $CTRACKING_BACKEND_URL  (first build compiles Rust)"
  # `--config` is a native tauri flag; cargo feature flags are forwarded after `--`.
  # `${arr[@]+"${arr[@]}"}` expands to nothing for an empty array (production has no
  # override config) without tripping `set -u` on macOS's bash 3.2.
  pnpm tauri dev ${cfg_args[@]+"${cfg_args[@]}"} -- --no-default-features --features "$FEATURE"
}

case "$COMPONENT" in
  backend)
    start_backend
    ;;
  desktop)
    start_desktop
    ;;
  all)
    "$ROOT/scripts/dev-db.sh" >/dev/null
    # Backend in the background; tear it down when the desktop (foreground) exits.
    ( cd "$ROOT/apps/backend"; \
      PORT="$PORT" DATABASE_URL="$DATABASE_URL" JWT_SECRET="$JWT_SECRET" \
      STORAGE_DIR="$STORAGE_DIR" go run ./cmd/server ) &
    BACKEND_PID=$!
    trap 'echo; echo "→ stopping backend ($ENV)"; kill "$BACKEND_PID" 2>/dev/null || true' EXIT
    echo "→ backend ($ENV) starting on $BACKEND_URL (pid $BACKEND_PID) · db=$DB"
    echo -n "→ waiting for backend port :$PORT"
    until nc -z localhost "$PORT" >/dev/null 2>&1; do
      kill -0 "$BACKEND_PID" 2>/dev/null || { echo " — backend exited early"; exit 1; }
      echo -n "."; sleep 1
    done
    echo " up."
    start_desktop
    ;;
esac
