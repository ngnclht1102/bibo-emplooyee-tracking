# 111 — Rebrand display name to "BiBoTracking"

- **Phase:** 9
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** —
- **Blocks:** —

## Goal
Rename the **visible brand** from "BiBoEmployeeTracking" to **"BiBoTracking"** across
the product. Display name only — no infrastructure or build-artifact changes.

## Scope (display name only — per decision)
Replace the exact token `BiBoEmployeeTracking` → `BiBoTracking` everywhere it is the
user-visible brand:
- Web admin: UI strings, `appName` in i18n `common` catalogs (all 7 locales), logo
  `alt`, any titles.
- Desktop: React UI, i18n catalogs (all 7 locales, all namespaces), the Tauri window
  `title` in `tauri.conf.json`, and the Rust tray strings (Quit label + tooltip) in
  `src-tauri/src/tray/mod.rs`.
- Marketing: `src/template.html`, `src/i18n/*.json` (brand kept verbatim inside
  translated values), then regenerate `site/` (incl. `<title>`, OG/meta, JSON-LD
  `name`, footer/nav). Note: brand appears in many SEO fields — all become BiBoTracking.
- Docs: references in `docs/**` and `marketing/README.md`.

## Explicitly OUT of scope (unchanged)
- Production domain `employeetracking.namnguyen.pro` (DNS + Cloudflare tunnel).
- Build/product identifiers: Tauri `productName` (`employeetrack`), bundle
  `identifier` (`com.briannguyen.ctracking`), the `EmployeeTracker-macOS.dmg` filename
  and `/download/...` path.
- Chrome extension slug `employee-tracker` and its Web Store URL (external listing).
- The marketing vs-Hubstaff table label "Employee Tracker" (left as-is per decision).
- Backend has no brand string (0 files).

## Acceptance criteria
- [x] No `BiBoEmployeeTracking` left anywhere tracked (`git grep` = zero) — renamed
      across 77 files via exact-token replace.
- [x] Tauri window title + Rust tray show "BiBoTracking"; `productName` (`employeetrack`),
      `identifier`, domain, DMG filename, extension slug untouched.
- [x] Marketing `site/` regenerated; locale pages show BiBoTracking in title/OG/
      JSON-LD/body (zh page: 23 hits, 0 old-brand).
- [x] web-admin + desktop typecheck; `cargo check` passes; marketing build runs.

## Notes
- A second-phase ticket can later tackle domain + Chrome extension + DMG renames if a
  full rebrand (including infra) is wanted.
