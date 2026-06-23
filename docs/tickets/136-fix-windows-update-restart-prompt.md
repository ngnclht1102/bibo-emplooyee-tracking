# 136 — Fix: Windows auto-update restarts immediately, no "restart now?" prompt

**Status:** Fixed (shipping in 1.3.8)
**Type:** Bug
**Relates to:** [131](131-update-ux.md) (which promised restart-on-confirm)

## Symptom
On Windows, when a newer version is found the app **downloads and restarts itself
immediately** — the user never sees the "Version X downloaded. Restart now?" dialog that
131 introduced. macOS prompts correctly.

## Root cause
[`updater.ts`](../../apps/desktop/src/updater.ts) staged the update with
`update.downloadAndInstall()` and only *afterwards* called `promptRestart()`.

- **macOS:** `install` just unpacks the new `.app`; nothing restarts until the explicit
  `relaunch()` inside the prompt → the dialog shows. ✓
- **Windows:** `downloadAndInstall` runs the NSIS installer in `installMode: "quiet"`
  (`tauri.conf.json`) the instant the bytes land — it closes the running exe, swaps it and
  relaunches **before** `promptRestart()` can render. So the prompt is never seen. ✗

## Fix
Split download from install (plugin-updater 2.10.1 exposes both):
- `downloadUpdate` now calls `update.download(...)` — stages bytes only, no install.
- `promptRestart(update)` calls `update.install()` **then** `relaunch()` only after the
  user clicks "Restart now". On Windows `install()` runs the quiet installer (which closes +
  relaunches itself); on macOS it unpacks and `relaunch()` restarts. Both prompt first.

Both callers (`checkForUpdates`, `autoCheckAndPrompt`) now pass the `update` object.
`tsc --noEmit` clean; `updater:default` capability already covers `install`.

## Note on rollout
The fix lives in the *updater client*, so it only governs updates **from 1.3.8 onward**.
Users currently on 1.3.4–1.3.7 still have the old behavior when updating *to* 1.3.8; the
correct prompt appears starting 1.3.8 → 1.3.9.
