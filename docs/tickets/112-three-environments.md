# 112 — Three environments (local / staging / production) for admin + desktop

- **Phase:** 8
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** —
- **Blocks:** —

## Goal
Make the web admin and the desktop app target one of three backends, selected at
build/run time:

| Env | Backend URL |
|-----|-------------|
| local | `http://localhost:8080` |
| staging | `https://staging.example.com` |
| production | `https://bibotracking.com` |

## Web admin (Vite)
- The API base comes from `VITE_API_BASE` (`api/client.ts`). Add Vite mode env files:
  - `.env.staging` → `VITE_API_BASE=https://staging.example.com`
  - `.env.prod` → `VITE_API_BASE=https://bibotracking.com`
  - local/dev (`npm run dev`) keeps `VITE_API_BASE` empty → relative URLs + the dev
    proxy forwards `/v1` to `http://localhost:8080`.
- Scripts: `build:staging` (`vite build --mode staging`), `build:prod`
  (`vite build --mode prod`). Default `build` stays same-origin (empty base) so the
  co-served deploy still works regardless of domain.
- `.env.example` documents the knobs.

## Desktop (Tauri / Rust)
- Compile-time selection of `DEFAULT_BACKEND_URL` via Cargo features in
  `src-tauri/Cargo.toml`: `local`, `staging`, `production` (default = `production`).
  Resolution order local → staging → production.
- Runtime override `CTRACKING_BACKEND_URL` still wins (used by `dev-desktop.sh`).
- Build commands:
  - local: `cargo … --no-default-features --features local` (or just run dev with the
    env override).
  - staging: `--no-default-features --features staging`
  - production: default (`bibotracking.com`).

## Acceptance criteria
- [x] Web admin builds with each mode and bakes the right base: `build:staging` →
      employeetracking, `build:prod` → bibotracking, default `build` → same-origin
      (no absolute base). Verified by grepping the built bundle.
- [x] Desktop `cargo check` passes for default (production), `--features staging`, and
      `--features local`; `backend_base_url()` resolves to the compiled default and the
      settings tests pass (4/4).
- [x] Dev unchanged: `npm run dev` → localhost proxy; `dev-desktop.sh` keeps the
      `CTRACKING_BACKEND_URL` runtime override (local).

## Notes / follow-ups
- **Deploy skills split (done):** `deploy-employeetracking` → renamed **`deploy-staging`**
  (staging.example.com, same-origin admin; `build:staging` available). Added
  **`deploy-production`** as a PLACEHOLDER for `bibotracking.com` with a prerequisites
  checklist — not wired up yet. (Skills live in the local-only `.claude/skills/`.)
- Desktop build skills (dmg/exe) now bake **production = bibotracking.com** by default;
  update their "production URL baked in" verification once prod is live.
- `bibotracking.com` must be provisioned (DNS/tunnel/cert + prod Postgres) before
  production traffic — tracked in the deploy-production placeholder.
