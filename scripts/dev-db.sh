#!/usr/bin/env bash
# Start a local Postgres for the ctracking backend (Docker). Idempotent: creates
# the container on first run, starts it on later runs. Matches apps/backend/.env*.example.
#
# One container, one separate database PER ENVIRONMENT so dev/staging/prod never
# share state when run locally:
#   ctracking          → dev/local   (apps/backend/.env.example)
#   ctracking_staging  → staging     (apps/backend/.env.staging.example)
#   ctracking_prod     → production  (apps/backend/.env.prod.example)
set -euo pipefail

NAME=ctracking-dev-db
PORT=5432
# Per-env databases created alongside the default `ctracking` (the container's
# POSTGRES_DB). Keep in sync with the apps/backend/.env*.example files.
ENV_DBS=(ctracking_staging ctracking_prod)

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

# Create one database per environment (idempotent — skip if it already exists).
for db in "${ENV_DBS[@]}"; do
  if docker exec "$NAME" psql -U ctracking -tAc \
       "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -qx 1; then
    echo "→ database $db already exists"
  else
    echo "→ creating database $db"
    docker exec "$NAME" createdb -U ctracking "$db"
  fi
done

echo "   DSNs (one db per env):"
echo "     dev/local  postgres://ctracking:ctracking@localhost:$PORT/ctracking?sslmode=disable"
echo "     staging    postgres://ctracking:ctracking@localhost:$PORT/ctracking_staging?sslmode=disable"
echo "     production postgres://ctracking:ctracking@localhost:$PORT/ctracking_prod?sslmode=disable"
echo "   (stop with: docker stop $NAME   ·   wipe with: docker rm -f $NAME)"
