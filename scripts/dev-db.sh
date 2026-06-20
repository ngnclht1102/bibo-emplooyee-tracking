#!/usr/bin/env bash
# Start a local Postgres for the ctracking backend (Docker). Idempotent: creates
# the container on first run, starts it on later runs. Matches apps/backend/.env.example.
set -euo pipefail

NAME=ctracking-dev-db
PORT=5432

if docker ps -a --format '{{.Names}}' | grep -qx "$NAME"; then
  echo "→ starting existing container $NAME"
  docker start "$NAME" >/dev/null
else
  echo "→ creating container $NAME on :$PORT"
  docker run -d --name "$NAME" \
    -e POSTGRES_USER=ctracking \
    -e POSTGRES_PASSWORD=ctracking \
    -e POSTGRES_DB=ctracking \
    -p "$PORT:5432" \
    postgres:16 >/dev/null
fi

echo -n "→ waiting for Postgres to accept connections"
until docker exec "$NAME" pg_isready -U ctracking -d ctracking >/dev/null 2>&1; do
  echo -n "."
  sleep 1
done
echo " ready."
echo "   DSN: postgres://ctracking:ctracking@localhost:$PORT/ctracking?sslmode=disable"
echo "   (stop with: docker stop $NAME   ·   wipe with: docker rm -f $NAME)"
