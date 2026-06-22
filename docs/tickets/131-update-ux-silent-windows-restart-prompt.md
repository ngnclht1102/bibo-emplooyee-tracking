# 131 — Update UX: silent Windows install, focus re-check, restart-on-confirm

**Status:** Done (ships in 1.3.4)
**Type:** Implementation

## Goals
Three auto-update UX fixes the user asked for:
1. **Windows updates were not silent** — the NSIS installer popped a window with buttons.
2. **Only checked for updates once on launch** — should also check when the user comes
   back to the app.
3. **Auto-relaunched without asking** — should download, then *prompt* the user to restart,
   and only relaunch on confirmation.

## Changes

### 1. Silent Windows install (`src-tauri/tauri.conf.json`)
Set `plugins.updater.windows.installMode = "quiet"` (was unset → Tauri default `passive`,
which shows an installer window). `quiet` runs the NSIS updater with no UI.

> **Forward-only:** `installMode` is compiled into the *installed* app's updater, so the
> 1.3.3→1.3.4 hop still shows the old passive window (1.3.3's binary). Updates **from 1.3.4
> onward** are silent.

### 2. Check on focus, not just launch (`src/App.tsx`)
The launch-only `autoUpdateOnLaunch()` effect is replaced by `autoCheckAndPrompt()` wired to
run on launch **and** on every `window` `focus` / `visibilitychange`. De-duped + throttled
in `updater.ts` (see below) so alt-tabbing doesn't hammer the endpoint.

### 3. Download then prompt to restart (`src/updater.ts`)
- Split download from relaunch: `downloadUpdate()` stages the signed artifact but **does not
  relaunch**. `promptRestart()` shows a native dialog (`ask`, "Restart now" / "Later") and
  relaunches **only on confirm**.
- `checkForUpdates()` (manual, Settings) and `autoCheckAndPrompt()` (launch/focus) both end
  in `promptRestart()` instead of an automatic `relaunch()`.
- `autoCheckAndPrompt()` guards: skips when a check is in flight, rate-limits to one network
  check per **5 min**, and once an update is downloaded-and-waiting it stops re-checking /
  re-prompting for the rest of the run (re-checked on next launch). Avoids prompt spam when
  the user declines and keeps focusing the window.
- Progress state `installing` → `ready`; Settings shows "Update X ready — restart to apply."
  and re-enables the button (no more auto-relaunch).

No new deps or capabilities — `dialog:default` already covers `ask`, `process:default`
covers `relaunch`.

## Verify
- `tsc --noEmit` clean.
- Shipped via the standard signed auto-update pipeline as **1.4.x/1.3.4** (mac universal +
  Windows MSI/NSIS, signed `latest.json`).
