# 78 — QA: Windows download page

- **Phase:** 6
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 77
- **Blocks:** 79

## Goal
Confirm the public Windows download works end-to-end from the live site.

## Interactive checklist
- [ ] Visit the live landing page on Windows — "Download for Windows" is shown/highlighted.
- [ ] Visit on macOS — DMG is shown/highlighted; both links present.
- [ ] Click the Windows link → downloads the signed `.exe` (correct filename + version).
- [ ] Cache-bust `?v=` serves the latest artifact after a redeploy (no stale binary).
- [ ] Page source: JSON-LD `operatingSystem` includes Windows; meta/keywords accurate.
- [ ] Installed-from-website binary launches and runs (ties back to task 76).

## Pass condition
All boxes checked. Any failure → reopen task 77.
