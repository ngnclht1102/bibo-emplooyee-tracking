# 123 — Sentry: web-admin (React)

**Status:** Done
**Type:** Implementation

## Goal
Report unhandled React errors + API failures from the owner dashboard to Sentry. DSN
read from Vite env so it differs per build mode (local/staging/prod).

DSN provided:
`https://29a251c743d7837aca841dd87e496f34@o714773.ingest.us.sentry.io/4511603502940160`

## Changes
- `npm i @sentry/react` (in `apps/web-admin`).
- **Env**: add `VITE_SENTRY_DSN` to `.env.staging` / `.env.prod` (and document in repo).
  Leave empty for local `dev` so it's a no-op there.
- **Init** (`apps/web-admin/src/main.tsx`): before `createRoot`, if
  `import.meta.env.VITE_SENTRY_DSN`:
  ```ts
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
  });
  ```
  Wrap `<App/>` render so errors propagate (Sentry's global handlers catch unhandled);
  optionally add `<Sentry.ErrorBoundary>` around `<App/>` with a minimal fallback.
- **API errors** (`src/api/client.ts`): in the `!res.ok` branch, before throwing
  `ApiError`, call `Sentry.captureException` for 5xx (skip 401/expected 4xx to reduce
  noise). This is also where ticket 126's network logging hooks in — coordinate so we
  don't double-report.

## Verify
- `npm run typecheck` + `npm run build` clean.
- Local `dev` (no DSN) → no Sentry calls.
- Build with DSN set + trigger a thrown error (temporary button) → event in Sentry with
  `environment` tag matching the mode.
