# 126 — Logging strategy: shared log util + network-call logging

**Status:** Done
**Type:** Implementation

## Goal
Consistent, debuggable logging across the stack: one log util per runtime that writes to
console AND forwards to Sentry (breadcrumbs for info, captured events for errors), logs
on important flows, and records network calls (method, path, status, duration) on the
front ends + Rust + backend.

## Per-runtime work

### web-admin (`apps/web-admin/src`)
- New `src/log.ts`: `log.debug/info/warn/error(msg, fields?)`. Each call →
  `console.*` + `Sentry.addBreadcrumb` (info/warn) or `Sentry.captureException`
  (error, if DSN set). No-op-safe when Sentry disabled.
- `src/api/client.ts`: wrap `request()` to log every call:
  `log.info("api", {method, path, status, ms})` on completion, `log.warn`/`error` on
  failure. Add a Sentry breadcrumb per request (category `fetch`). Keep the existing
  401-refresh flow intact. Reconcile with 123 so 5xx is reported once, not twice.
- Add `log.info` at important flows: login success/logout, business switch, report load
  failures.

### desktop UI (`apps/desktop/src`)
- Mirror `log.ts` (same shape; UI Sentry DSN from 124).
- Wrap the `invoke()` calls (add a thin `call<T>(cmd, args)` helper in e.g.
  `src/api.ts`) that logs `log.info("invoke", {cmd, ms})` + warns on rejection, and use it
  in screens that currently do bare `invoke(...).catch(()=>{})`.

### Rust core (`apps/desktop/src-tauri/src`)
- New `obs` module (helper from 124 lives here): `log_info!/log_warn!/log_err!` macros
  that `eprintln!` with a tag AND add a Sentry breadcrumb / capture. Replace the existing
  ad-hoc `eprintln!("[server] …")`, `[sync]`, `[keyboard]`, `[screenshot]`, `[tracker]`
  lines with these macros.
- Network logging: in `sync/client.rs`, log each backend call
  (`log_info!("sync", "POST {} -> {} in {}ms", path, status, ms)`) and `log_err!` on
  failure (already returns `Err`; add the log + breadcrumb).

### backend (`apps/backend`)
- Keep `gin.Logger()` for request logs. Add `slog` (stdlib) as the structured logger;
  small `internal/obs` wrapper used in important flows (auth login/refresh outcomes, sync
  batch sizes accepted, retention sweeps). `serverError` already reports to Sentry (122);
  have it also `slog.Error`.

## Principles
- Logs must never include secrets (tokens, passwords, refresh tokens) or full page
  contents — log path/status/duration/ids only.
- Everything degrades to plain console/stderr when Sentry DSN is empty.

## Verify
- All four typecheck/build: web-admin `tsc`+`vite build`; desktop `tsc` + `cargo check`;
  backend `go build ./...`.
- Run desktop + web admin locally; confirm console shows `api`/`invoke`/`sync` lines with
  method/status/ms and no secrets. With DSNs set, breadcrumbs appear attached to a
  captured error.
