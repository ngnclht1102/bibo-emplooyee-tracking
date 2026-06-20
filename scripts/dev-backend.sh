#!/usr/bin/env bash
# Run the Go backend locally. Migrations (incl. 00006_personas) run automatically
# on startup. Needs Postgres up first — run scripts/dev-db.sh in another terminal.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/backend"

# Seed a local .env from the example on first run (loaded by godotenv).
if [[ ! -f .env ]]; then
  echo "→ creating apps/backend/.env from .env.example"
  cp .env.example .env
fi

echo "→ backend on http://localhost:8080  (Ctrl-C to stop)"
go run ./cmd/server
