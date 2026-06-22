# 130 — Desktop Settings: show installed app version

**Status:** Done (ships in 1.3.3)
**Type:** Implementation

## Goal
Let users see which version of BiBoTracking they're running, directly on the desktop app's
Settings screen — useful for support and for confirming an auto-update actually landed.

## Change
`apps/desktop/src/screens/Settings.tsx`: added a **Version** row at the top of the existing
**Updates** section, showing `v<version>` (e.g. `v1.3.3`). The value comes from
`getVersion()` (`@tauri-apps/api/app`), which reads the version baked into
`tauri.conf.json` at build time — single source of truth, no manual string to keep in sync.

Kept in English alongside the other strings already hardcoded in that section (the
auto-/manual-update copy); the section can be localized as a unit later.

## Verify
- `tsc --noEmit` clean.
- Shipped via the standard auto-update release pipeline as **1.3.3** (mac universal DMG +
  `.app.tar.gz`, Windows MSI + NSIS, signed `latest.json` at bibotracker.com).
