# 124 — Sentry: desktop (Rust core + React UI)

**Status:** Done
**Type:** Implementation

## Goal
Capture crashes/errors from both halves of the Tauri app:
- **Rust core** — panics + handled errors in trackers/server/sync.
- **React UI** — unhandled render/runtime errors.

DSNs: separate Sentry projects — one for the **Desktop FE (UI)**, one for the **Desktop
Rust core**.
- **Rust core DSN (set):** `https://fa7016ecbd5b2c79337c80c48809dba4@o714773.ingest.us.sentry.io/4511603491930112`
  — baked as a compile-time default in `obs::DEFAULT_SENTRY_DSN` (empty under the `local`
  feature so dev is quiet), runtime-overridable via `CTRACKING_SENTRY_DSN`. Uses
  `send_default_pii: true` + `release_name!()` per the provided config.
- **UI DSN (set):** `https://59bb5815f8883fdfbbe8c92e81759c2f@o714773.ingest.us.sentry.io/4511603488129024`
  — baked in `src/sentry.ts` as the default for release builds (`import.meta.env.PROD`),
  empty in dev (`tauri dev`), overridable via `VITE_SENTRY_DSN`. Separate JS/React project
  from the Rust core.

## Changes — Rust (`apps/desktop/src-tauri`)
- `Cargo.toml`: add `sentry = { version = "0.34", default-features = false, features =
  ["backtrace", "contexts", "panic", "rustls"] }` (rustls to match reqwest; avoid
  native-tls/openssl).
- `lib.rs` `run()`: **before** building the Tauri app, init a guard if DSN present:
  ```rust
  let _sentry = std::env::var("CTRACKING_SENTRY_DSN").ok()
      .filter(|d| !d.is_empty())
      .map(|dsn| sentry::init((dsn, sentry::ClientOptions {
          release: sentry::release_name!(),
          environment: Some(env_label().into()), // local/staging/production from cargo feature
          ..Default::default()
      })));
  ```
  Keep `_sentry` alive for the whole process (drop = flush). The `panic` feature installs
  the panic hook automatically.
- Provide a small helper `crate::obs::capture(err)` wrapping `sentry::capture_error` /
  `capture_message` so trackers/server/sync can replace silent `eprintln!`s with a call
  that both logs and reports (overlaps ticket 126; land the helper here).

## Changes — React UI (`apps/desktop/src`)
- `npm i @sentry/react` (in `apps/desktop`).
- `src/main.tsx`: init exactly like web-admin (ticket 123) but with the desktop **UI**
  DSN from `VITE_SENTRY_DSN`; wrap `<App/>`.

## Notes
- Two DSNs ⇒ Rust and UI events land in separate projects, matching how the user framed
  it ("Desktop FE for UI, Desktop rust for Rust core").
- The local error-ingest endpoint for the **extension** is a separate ticket (125); it
  reuses the Rust `obs::capture` helper landed here.

## Verify
- `cargo check` (in `src-tauri`) + `npm run typecheck` (desktop) clean; `tauri build`
  not required for this ticket.
- With DSNs unset → app runs, no Sentry traffic.
- With DSNs set: a temporary `panic!` in a command → Rust event; a thrown error in a UI
  screen → UI event (separate projects).
