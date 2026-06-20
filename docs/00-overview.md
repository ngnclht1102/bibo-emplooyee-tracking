# ctracking — Overview

A **local-only desktop employee activity tracker** for macOS, in the spirit of
Hubstaff but with **no cloud backend**. All data stays on the monitored machine
and leaves only through an explicit **export** function.

## Goals (v1 scope)

1. **App usage per software** — track which application is in the foreground and
   for how long.
2. **Keyboard activity** — count keypresses per time bucket. We record *counts
   only*, never the actual characters/keys.
3. **Periodic screenshots** — capture the screen on a timer (e.g. every 5–10 min).
4. **Browser page tracking** — which web page is open and time spent per page,
   via a browser extension.
5. **Local storage + export** — everything in a local SQLite file; export to
   CSV/JSON. No server, no account, no sync.

## Non-goals (for now)

- No cloud backend, accounts, or multi-machine aggregation.
- No remote/central dashboard.
- No payroll, invoicing, or team-management features.
- No stealth/anti-tamper. The app is visible and permissions are user-granted.

## Key decisions

| Decision | Choice | Rationale |
|---|---|---|
| Target OS | **macOS only** | All monitored machines are Macs; dev machine is a Mac so everything is testable locally. |
| OS versions | **macOS 26 (Tahoe) primary; floor = macOS 13 (Ventura)** | Must run across multiple macOS versions; see [06-macos-compatibility.md](06-macos-compatibility.md). |
| UI style | **Flat, minimal, low-color; dark + light mode** | Quiet, utilitarian dashboard; see [07-ui-design.md](07-ui-design.md). |
| App framework | **Tauri v2** (Rust core + web UI) | Tiny binary, low RAM, native Rust access to macOS APIs. |
| Web UI | **React + Vite + TypeScript** | Largest ecosystem, fastest to build the dashboard. |
| Browser URLs | **Browser extension** | Only reliable way to get real URLs + per-page timing (window titles aren't enough). |
| Storage | **SQLite** (single local file) | Zero-config, embeddable, easy export. |

## Document index

- [00-overview.md](00-overview.md) — this file
- [01-architecture.md](01-architecture.md) — system shape, components, crates
- [02-data-model.md](02-data-model.md) — SQLite schema
- [03-macos-permissions.md](03-macos-permissions.md) — required macOS permissions
- [04-browser-extension.md](04-browser-extension.md) — extension + local ingest
- [05-roadmap.md](05-roadmap.md) — phased delivery plan
- [06-macos-compatibility.md](06-macos-compatibility.md) — macOS version support (incl. macOS 26)
- [07-ui-design.md](07-ui-design.md) — UI design principles, tokens, dark/light mode
- [08-dev-codesigning.md](08-dev-codesigning.md) — stable dev signing so TCC permissions persist across builds
- [09-menubar-and-dock.md](09-menubar-and-dock.md) — menu bar item (tracking/idle/paused) + hide-from-Dock
- [10-release-signing-notarization.md](10-release-signing-notarization.md) — universal build, signing & notarization
- [11-backend-and-sync.md](11-backend-and-sync.md) — Go/Gin/Postgres backend, one-way sync, web admin, screenshot cleanup
- [14-signup-and-onboarding.md](14-signup-and-onboarding.md) — persona signup wizard + first-run onboarding (web + desktop)
