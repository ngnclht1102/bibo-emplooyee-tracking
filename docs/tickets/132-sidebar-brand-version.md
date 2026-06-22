# 132 — Show app version under the sidebar brand

**Status:** Done (ships in 1.3.5)
**Type:** Implementation

## Goal
Surface the installed version right next to the **BiBoTracking** brand at the top of the
sidebar, so it's visible on every screen (not just Settings → ticket 130).

## Change
- `src/App.tsx`: fetch the version via `getVersion()` (`@tauri-apps/api/app`) and render
  `v<version>` as a small muted span inside the existing `.brand` element, beside the
  brand name.
- `src/theme.css`: `.brand` switched to `align-items: baseline`; new `.brand-version`
  (small, regular-weight, `--text-muted`, theme-aware light/dark).

Same single source of truth as ticket 130 — the version baked into `tauri.conf.json`,
nothing to keep in sync.

## Verify
- `tsc --noEmit` clean.
- Shipped via the standard signed auto-update pipeline as **1.3.5**.
