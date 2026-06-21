# 122 — Sentry: Go backend

**Status:** Done
**Type:** Implementation

## Goal
Capture backend panics + handled 500s in Sentry. DSN read from config/env so each
environment (local/staging/prod) can point at its own project (or none).

DSN provided:
`https://b1ef6d637f6c430cb96e06b36af35296@o714773.ingest.us.sentry.io/5779545`

## Changes
- `go get github.com/getsentry/sentry-go github.com/getsentry/sentry-go/gin`
- **Config** (`apps/backend/internal/config`): add `SentryDSN` (env `SENTRY_DSN`) and
  `Environment` (env `APP_ENV`, default `local`). Add both to `.env.example`. Empty DSN
  ⇒ Sentry disabled (no-op), so local dev stays quiet by default.
- **Init** (`cmd/server/main.go`): after config load, if DSN non-empty:
  ```go
  sentry.Init(sentry.ClientOptions{
      Dsn: cfg.SentryDSN,
      Environment: cfg.Environment,
      Release: version, // reuse build version if available, else omit
      TracesSampleRate: 0.0,
  })
  defer sentry.Flush(2 * time.Second)
  ```
- **Middleware** (`internal/server/server.go`): register `sentrygin.New(sentrygin.Options{Repanic: true})`
  right after `gin.Recovery()` so panics are reported then recovered.
- **Handled errors** (`internal/handlers/errors.go`): in `serverError`, also
  `sentry.CaptureException(err)` (or via `sentrygin.GetHubFromContext(c)`) so 500s are
  reported with request scope, not just logged.

## Verify
- `go build ./...` clean.
- With `SENTRY_DSN` unset → server boots, no Sentry traffic (disabled).
- With DSN set, hit a route that triggers `serverError` (or a temp `/debug/boom` panic
  route, removed after) → event appears in Sentry. Confirm `/healthz` still 200.
