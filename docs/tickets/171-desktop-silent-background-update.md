# 171 — Desktop: silent background update + self-restart, running task timer kept (CTR-48)

## Problem
Updates were driven entirely from the web UI: a check on launch and on every window
focus (throttled to one per 5 min), and after download the app always **asked** before
restarting (deliberate, tickets 131/136). A machine that leaves the app in the menu bar
and never opens the window was therefore **never** checked — and even when a check did
find a build, a machine nobody clicks on stays on the old version forever.

## Change (desktop only)
**The UI's rules are untouched** — same launch/focus checks, same 5-minute gap, same
"download then ask before restart" dialog, same manual check in Settings.

New, next to it: a **headless checker in the Rust core** (`src-tauri/src/selfupdate`).
- Runs **only while the app is in the background** (main window not visible); with the
  window up, updates stay the UI's business.
- Cadence **6 h** plus a random per-machine offset of up to 40 min, so machines started
  at the same time in the morning don't call in a clump. 6 h rather than hourly on
  purpose: we ship every few weeks, so users lose nothing, and it buys a window to pull
  a bad build from the manifest before most machines take it — which matters more now
  that the update restarts the app by itself. (Bandwidth is not the reason: the manifest
  is ~2 KB.)
- **One shared "last checked" mark** (`UpdateGate`, Rust-side, `update_claim_check`
  command): the UI claims it with a 5-minute gap, the background checker with 6 h, so
  closing/reopening the window can never produce two manifest calls seconds apart —
  in either direction.
- **Download only**, keeping `download()` and `install()` split (ticket 136): on Windows
  `install()` runs the quiet NSIS installer, which kills the app the instant it is called.

**Self-restart, but only at a safe moment.** With no window there is nobody to ask, so
the conditions replace the prompt — all of them, re-checked every minute:
- the window is still closed (if the user reopens it, the pending update is handed back
  to the UI's own check + dialog),
- no user input for **5 min** (don't cut into a meeting or a demo),
- the local DB is **WAL-checkpointed** (`Db::checkpoint`) right before installing, so
  nothing pending is left in a sidecar when the Windows installer kills us.
After 12 h with no safe moment the attempt is dropped and retried next cycle.

**No restart loop, and no window on the way back.**
- A marker file (`silent-update.json`) is written just before `install()`. On the next
  launch: version matches → the update landed, delete the marker; version does **not**
  match → that build is remembered as suspect and never auto-restarted into again.
- The marker also makes the relaunch **start hidden** — the app returns to the menu bar.
  Nobody asked for a window, they just got updated. (Signalled by file, not a CLI arg:
  the NSIS installer relaunches the app itself, so our args would be lost.)
- The restart is announced once, next time the user opens the window: the What's new
  popup gains a lead line, `messages.silentUpdated` — "Updated to X.Y.Z — your timer
  kept running." (7 locales).

## The running task timer survives a restart (checked, no change needed)
- The running task is persisted with its start instant and restored on launch, so the
  counter picks straight back up.
- The hours written for a task are **not** read off the UI counter: on stop the app
  recomputes real activity from the locally stored tracking data between start and stop.
  So a mid-task restart still yields the right number.
- Rows waiting to be synced live in the local DB — nothing is lost.
- Only the few seconds of the restart go missing, and those weren't work anyway.

## Verify
- `cargo check` clean (`apps/desktop/src-tauri`).
- `tsc --noEmit` + `vite build` clean (`apps/desktop`).
- **Manual, still to do:** start a task timer → force an update → after the relaunch the
  app is in the menu bar, the counter is still running, and the hours on stop match a
  run without a restart. Also confirm macOS screen-recording permission is not
  re-prompted after a silent update (same signature + bundle id).
