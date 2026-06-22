# 128 — Aptabase app analytics: plugin crash + direct-API workaround

**Status:** Done (live in 1.3.1)
**Type:** Implementation / Postmortem

## Goal
Count **app opens** (DAU, version adoption, OS breakdown) for the desktop app via
Aptabase (EU project, key `A-EU-4411171274`), always-on, no opt-in.

## The difficulty (what went wrong)

### Attempt 1 — the official plugin crashed the release build
Wired `tauri-plugin-aptabase` v1.0.0 (Rust) the documented way: register the plugin and
`app.track_event("app_started", None)` in `setup`. It built fine and **typechecked/`cargo
check`ed clean**, but the **release app crashed on launch**:

```
thread 'main' panicked at tauri-plugin-aptabase-1.0.0/src/client.rs:78:
  there is no reactor running, must be called from the context of a Tokio 1.x runtime
thread caused non-unwinding panic. aborting.   (in tao did_finish_launching)
```

**Root cause:** the plugin's own setup hook (`lib.rs:75`) calls `client.start_polling()`,
which does a **raw `tokio::spawn`** (`client.rs:78`) to run a background flush loop.
`tokio::spawn` only works inside a Tokio runtime context; in a Tauri **release** build that
setup runs on a thread that isn't in one, so it panics — and because it happens in the
macOS app delegate (`did_finish_launching`, a non-unwinding context) the process
**aborts** instead of erroring. It's entirely inside the dependency; we can't wrap or guard
it, and **v1.0.0 is the latest published version** (no fix to upgrade to).

### Why it was painful to diagnose
- **Didn't surface in `cargo check`/dev the way it did in release** — only the built,
  signed `.app` reliably reproduced it, so it slipped past normal checks.
- **A misleading secondary symptom:** running the raw Mach-O binary directly (instead of
  `open`-ing the `.app`) produced a *different* panic — `SqliteFailure … disk I/O error`
  from the DB-open path — which looked like a storage bug. Launching via `open` (the real
  user path) showed the app actually ran fine post-fix; the SQLite error was a
  raw-binary-launch artifact, not real. Cost triage time.
- The plugin also dragged in **`native-tls`**, which links `Security.framework` and broke
  the `build-desktop-dmg` "no Keychain" verification check (a false alarm).
- Surfaced **mid-release** (user reported "macOS app crashed after build"), forcing a
  rebuild of both platforms.

## Resolution
1. **Removed the plugin** to unblock the stable **1.3.0** release (auto-update was the
   headline feature and had to ship).
2. **Re-implemented analytics without the plugin** in **1.3.1**
   (`apps/desktop/src-tauri/src/analytics.rs`): POST an `app_started` event directly to the
   Aptabase EU ingest API (`https://eu.aptabase.com/api/v0/event`) over the **existing
   rustls `reqwest`**, dispatched via **`tauri::async_runtime::spawn`** (Tauri's managed
   runtime — the exact thing the plugin failed to use). Added `os_info` + `time` for
   `osVersion` + RFC3339 timestamp. `isDebug` tags dev runs.
3. Verified end-to-end: `app_started -> 200 OK`, app launches clean (no abort).

Bonus: the direct approach **drops the `native-tls` dependency** the plugin added, keeping
the binary on a single (rustls) TLS stack.

## Lessons
- **Test release builds, launched via `open`** — not just `cargo check` / `tauri dev` /
  raw binary. A clean `cargo check` proved nothing here.
- Avoid Tauri plugins that call **raw `tokio::spawn`**; Tauri code must use
  `tauri::async_runtime::spawn`.
- For a small, well-understood integration (one fire-and-forget POST), the **vendor's HTTP
  API beats a fragile plugin** — fewer deps, full control, no surprise runtimes.

## Notes
- Data only accrues **from 1.3.1 forward** (no backfill of earlier launches).
- Same Aptabase project/key as planned — only the client code changed.
