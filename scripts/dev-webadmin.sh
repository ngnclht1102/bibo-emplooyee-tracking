#!/usr/bin/env bash
# One command to run web-admin locally: starts the Go backend (:8090) AND the
# Vite web-admin dev server (:5174) together. Ctrl-C stops both.
#
# Prereqs (see CHAY-LOCAL.md): Postgres running on :5432 with role/db `ctracking`,
# plus Go + Node + pnpm installed. No Docker needed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Backend seeds its own .env from .env.example on first run.
echo "→ starting backend  http://localhost:8090"
"$ROOT/scripts/dev-backend.sh" &
BACKEND_PID=$!

# Kill the backend when this script exits (Ctrl-C, error, or normal end).
cleanup() {
  echo
  echo "→ stopping backend (pid $BACKEND_PID)"
  kill "$BACKEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Give the backend a moment to boot / run migrations.
sleep 2

echo "→ starting web-admin  http://localhost:5174/admin/"
echo "  (open that URL in your browser; Ctrl-C here stops everything)"
"$ROOT/scripts/dev-web.sh"
