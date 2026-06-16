# 35 — Backend scaffold (Go + Gin + Postgres)

- **Phase:** 5
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** —
- **Blocks:** 37, 41

## Goal
A running Go backend skeleton per [docs/11-backend-and-sync.md](../docs/11-backend-and-sync.md).

## Scope
- `apps/backend/` Go module: `cmd/server/main.go`, `internal/{config,db,middleware,handlers}`.
- Gin server; `GET /healthz` returns 200 + version.
- `pgx/v5` pool; `goose` migration runner wired in (empty initial migration ok).
- `internal/config` loads `DATABASE_URL`, `JWT_SECRET`, `STORAGE_DIR`, `PORT` from env;
  `.env.example` documents them.
- CORS middleware (web admin origin) + request logging.
- `Dockerfile` + `docker-compose` with Postgres for local dev.
- `storage/screenshots/` created on boot; gitignored.

## Acceptance criteria
- [ ] `go run ./cmd/server` boots and serves `/healthz`.
- [ ] Connects to Postgres; goose migrations run on startup (idempotent).
- [ ] Missing required env fails fast with a clear message.
- [ ] `docker-compose up` brings up backend + Postgres.
