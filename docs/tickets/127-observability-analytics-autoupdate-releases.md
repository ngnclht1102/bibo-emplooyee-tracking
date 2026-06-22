# 127 — Observability hardening, app analytics, auto-update + 1.2.0→1.3.1 releases

**Status:** Done (production, 2026-06-22)
**Type:** Implementation + Release

## Context
After Phase 10 (tickets 120–126) wired Sentry/logging/extension changes, this work made
the desktop product **operable and self-updating in production**: restrict Sentry to
production only, count installer downloads, add app-open analytics, ship **silent
auto-update**, package the extension for the Web Store, and cut three production releases
(1.2.0 → 1.3.0 → 1.3.1) to `https://bibotracker.com`. Goal: ship updates to users without
manual re-downloads and get real download/usage/error signal.

## What shipped

### 1. Sentry → production-only (refines 122–124)
- Removed the staging DSNs (backend `.env.staging.example`, web-admin `.env.staging`).
- Desktop Rust gates the baked DSN on `cfg!(debug_assertions)` **and** the `production`
  feature; desktop UI gates on `import.meta.env.PROD`. Dev + staging report nothing.
- Per-event **user identity** attached on all four runtimes (web `AuthContext`, desktop
  `App.tsx` + Rust `AuthState`, backend auth middleware).

### 2. Installer download counter (backend)
- `download_counts` table (migration `00008`), `store/stats.go`, `handlers/downloads.go`.
- `GET /download/:file` increments per-platform + serves with `Cache-Control: no-store`;
  public readout `GET /v1/public/stats/downloads`. Only `.dmg`/`.msi` count (update
  artifacts excluded). **Requires a Cloudflare cache-bypass rule for `/download/*`** —
  CDN HITs never reach the origin (see follow-ups).

### 3. App-open analytics (Aptabase, EU)
- First tried `tauri-plugin-aptabase` v1.0.0 — it **panics in release** (`start_polling`
  uses raw `tokio::spawn` outside a runtime → app aborts on launch). Removed it.
- Re-implemented crash-free in `src-tauri/src/analytics.rs`: POSTs an `app_started` event
  directly to the Aptabase EU ingest API over the existing **rustls** `reqwest`, dispatched
  on `tauri::async_runtime::spawn`. Key `A-EU-4411171274`, always-on (`isDebug` tags dev).
  Verified `app_started -> 200 OK`.

### 4. Desktop auto-update (Tauri updater — signed, self-hosted)
- Ed25519 keypair generated; **private key + password stored in gitignored
  `deploy/updater/`** (pubkey baked into `tauri.conf.json`). See that dir's README.
- `plugins.updater` → `https://bibotracker.com/download/latest.json`,
  `createUpdaterArtifacts: true`; `tauri-plugin-updater` + `-process` + capabilities.
- App: silent check on launch + a manual **Check for updates** in Settings (`src/updater.ts`).
- **MSI stays the download; NSIS is the silent update channel** (MSI auto-update triggers
  a UAC prompt each time; NSIS updates silently).
- `deploy/build-prod.sh` stages the signed update artifacts (mac `.app.tar.gz`, win NSIS
  `-setup.exe`, each `.sig`) and generates `latest.json`.

### 5. Browser extension packaging
- Rebranded to **BiBo Tracker** (ticket 120), bumped to **0.2.0**.
- Produced a Web-Store **ZIP** (`manifest.json` at root) and a self-host **CRX** + signing
  key in gitignored `deploy/extension-dist/`. (CWS rejects `.crx`; needs the `.zip`.)

### 6. Releases to production
| Version | Notes |
|---|---|
| 1.2.0 (re-deploy) | Phase 10 build; later added the **Windows MSI** (winbuild was offline first pass). |
| 1.3.0 | Auto-update **client** first ships here; download counter live. |
| 1.3.1 | Crash-free analytics; **current production**. |

Each: signed mac universal DMG + Windows MSI/NSIS, `latest.json`, marketing SEO
`softwareVersion`, backend + web-admin, via `deploy/deploy-prod.sh`.

## Verification
- **Auto-update e2e:** built a 1.2.99 app, launched it → it fetched prod `latest.json`,
  verified the Ed25519 signature, installed, and **relaunched as 1.3.0** (bundle version
  flipped automatically). Confirmed again at 1.3.1.
- **Analytics:** `app_started -> 200 OK` from the running app.
- **Downloads:** counter increments on cache-MISS origin hits; `/v1/public/stats/downloads`
  returns totals.
- **Production:** `/healthz` 200, `latest.json` lists mac+win with signatures, all four
  download/update URLs 200, SEO version 1.3.1, app launches clean (no Aptabase crash).

## Gotchas (for next time)
- `tauri-plugin-aptabase` v1.0.0 is unusable in release (raw `tokio::spawn`). Use the
  direct API.
- `bundle_dmg.sh` intermittently fails on a **stale mounted volume** — detach `dmg.*`
  volumes + remove `rw.*.dmg` before building (note: **zsh aborts on unmatched globs** —
  guard them).
- Windows signing env is `TAURI_SIGNING_PRIVATE_KEY` (accepts a path); `_PATH` is **not**
  honored by the bundler. PowerShell-over-SSH returns nonzero from stderr — judge by log.
- Build skills updated: `build-desktop-dmg`, `build-desktop-exe`, `deploy-production`.

## Follow-ups (open)
- **macOS notarization** — DMG is Apple-Development-signed, **not notarized**; downloaded
  apps hit Gatekeeper ("Apple could not verify…"). Needs Apple Developer Program ($99/yr) →
  Developer ID + notarize (`tauri.conf.json` already supports it via env). No free option.
- **Windows Authenticode** — MSI/NSIS unsigned (SmartScreen warns). SignPath (free, if
  eligible) or Azure Trusted Signing (~$10/mo); both sign in CI. (See task 75.)
- **Cloudflare cache-bypass rule** for `/download/*` — required for accurate counts +
  fresh `latest.json`.
- **Re-add analytics → app-open data backfills only from 1.3.1 forward** (no history).
- Commits are on local `main`, **not pushed**.
