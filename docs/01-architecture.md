# Architecture

## System shape

```
┌─────────────────────── Tauri App (the agent) ───────────────────────┐
│  Rust core (background trackers)            Web UI (dashboard)       │
│  ┌──────────────────────────────┐           ┌─────────────────────┐ │
│  │ ActiveWindowTracker  (1s)    │           │ Today's timeline    │ │
│  │ KeyboardCounter (CGEventTap) │  ──SQLite─▶│ App breakdown       │ │
│  │ ScreenshotTaker (5–10 min)   │           │ Screenshot gallery  │ │
│  │ BrowserIngest (localhost srv)│◀──┐        │ Export CSV/JSON     │ │
│  └──────────────────────────────┘   │        └─────────────────────┘ │
└──────────────────────────────────────┼──────────────────────────────┘
                                        │ POST active tab {url, title, ts}
                              ┌─────────┴──────────┐
                              │ Chrome/Edge ext    │  (background service worker)
                              └────────────────────┘
```

## Components

### Rust core (runs in background)

| Component | Cadence | Responsibility |
|---|---|---|
| `ActiveWindowTracker` | poll ~1s | Read foreground app name + window title + pid; coalesce into intervals and persist when the active window changes. **Only counts time while the session is active (see Idle detection); idle/locked/asleep time is not counted.** |
| `IdleMonitor` | poll ~1s | Track seconds since last user input. When idle ≥ threshold (or screen locked / display asleep), mark the session **idle** so the active-window interval stops accumulating. |
| `KeyboardCounter` | event-driven | Global keyboard listener via `CGEventTap`. Increments an in-memory counter; flushes counts per N-minute bucket. **Never stores which key.** |
| `ScreenshotTaker` | timer (5–10 min) | Capture each display to a PNG on disk; write the file path + metadata to the DB. |
| `BrowserIngest` | on request | Tiny HTTP server on `127.0.0.1:<port>`; receives active-tab `{url, title, ts}` posts from the browser extension and persists per-page durations. |

### Web UI (Tauri webview)

- Today's timeline / app breakdown
- Screenshot gallery
- Keyboard-activity chart (counts over time)
- Browser visit list
- Settings (intervals, pause/resume)
- Export (CSV/JSON)

The UI talks to the Rust core through Tauri **commands** (synchronous queries) and
**events** (live updates). It never touches the OS directly.

### Idle detection (only count active time)

Time is counted **only while the user is actively present**. If the window/app is
not active, or the user stops interacting, we do not count that time.

- **Source of truth:** seconds since the last user input event, via
  `CGEventSourceSecondsSinceLastEventType` (covers keyboard + mouse). No special
  permission needed for the idle *duration* itself.
- **Idle threshold:** configurable, default **60s** of no input → session goes
  `idle`. (Hubstaff-style; tune in settings.)
- **What stops the clock:**
  - idle ≥ threshold (no keyboard/mouse for that long),
  - screen **locked**,
  - display **asleep** / system sleep,
  - no foreground app (rare).
- **Behavior:** while idle, the current `activity_sample` interval **stops
  accumulating** `duration_s`. When input resumes, a **new** interval starts.
- **Retroactive trim (optional, recommended):** because we only learn the user went
  idle after the threshold elapses, subtract the idle-grace window so the last
  interval reflects the *last actual input*, not the moment we detected idle.
- **Interaction with KeyboardCounter (Phase 2):** the same input signal feeds idle
  detection; we still only store counts, never keys.

### `platform` module

All OS-version-sensitive logic (screen capture, permission status checks, System
Settings deep links) lives behind one small Rust `platform` module so version
branches are contained in a single place. See
[06-macos-compatibility.md](06-macos-compatibility.md).

## Crate choices (macOS-supported, mature)

| Concern | Crate | Notes |
|---|---|---|
| Active app/window | `active-win-pos-rs` | App name, window title, pid. Needs Accessibility for titles. |
| Keyboard counting | `rdev` | Global input listener (uses `CGEventTap`). Needs Accessibility + Input Monitoring. |
| Screenshots | `xcap` | Multi-display capture to image buffers. Needs Screen Recording. Prefers ScreenCaptureKit on modern macOS — see [06-macos-compatibility.md](06-macos-compatibility.md). |
| Storage | `rusqlite` | Bundled SQLite, single file, easy export. |
| Browser ingest server | `axum` (+ `tokio`) | Minimal loopback HTTP endpoint. |

## Privacy posture

- Keyboard: **counts only**, keys are discarded immediately — never written to disk.
- All data is local; the only egress is the user-triggered export.
- Permissions are explicit macOS grants (see [03-macos-permissions.md](03-macos-permissions.md)).
- Screenshots can optionally be downscaled/blurred and are subject to a retention policy.
