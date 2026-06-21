# 118 — Release 1.1.0: desktop builds + Windows MSI download on marketing site

**Status:** Done (deployed to production 2026-06-21)

## Goal
Cut desktop **1.1.0** for both platforms and let visitors download the Windows app
from the marketing site (previously macOS-only).

## Changes
- **Version bump → 1.1.0** across the three manifests (`apps/desktop/package.json`,
  `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`) + `Cargo.lock`.
- **Builds**
  - macOS: Universal 2 signed `.dmg` via `build-desktop-dmg`
    (`employeetrack_1.1.0_universal.dmg`, arch x86_64+arm64, prod URL baked, sig valid).
  - Windows: WiX **MSI** via `build-desktop-exe` path on `winbuild`
    (`--bundles msi` → `employeetrack_1.1.0_x64_en-US.msi`). Unsigned (SmartScreen warns;
    Authenticode signing still pending — see task 75).
- **Marketing** (`marketing/src/template.html` + `src/i18n/<code>.json`, 7 locales):
  added a **Download for Windows** button next to macOS in hero, pricing (free tier),
  final CTA, and footer; stable link `/download/EmployeeTracker-Windows-x64.msi`.
  JSON-LD `operatingSystem` → "macOS 13+, Windows 10+", `softwareVersion` → 1.1.0.
  New i18n keys: `hero.downloadWin`, `cta.downloadWin`, `footer.downloadWin`,
  `pricing.free.btnWin`.
- **Deploy** (`deploy/build-prod.sh`, local-only): stage the Windows MSI into
  `web/download/EmployeeTracker-Windows-x64.msi` (mirrors the existing DMG staging,
  newest `*_x64_*.msi` from the cross-target bundle dir).

## Verify (production, bibotracker.com)
- `GET /download/EmployeeTracker-Windows-x64.msi` → 200, `application/x-msi`, 6,230,016 B.
- `GET /download/EmployeeTracker-macOS.dmg` → 200, 13,269,292 B.
- Home page references the MSI in all 4 spots; locales render localized labels
  (e.g. zh "下载 Windows 版"). `/healthz` 200.

## Notes / follow-ups
- MSI is **unsigned** — sign before broad distribution (task 75).
- Windows installers must be built on the LAN Windows PC (`winbuild`); macOS DMG builds
  on the Mac. Both default to the production backend (`https://bibotracker.com`).
