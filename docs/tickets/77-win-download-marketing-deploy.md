# 77 — M5: Windows download + marketing/SEO + deploy

- **Phase:** 6
- **Type:** Implementation
- **Status:** Blocked
- **Blocked by:** 74
- **Blocks:** 78

> Plan: [docs/12-windows-support-plan.md](../12-windows-support-plan.md) §5.5.
> Deploy: `deploy-employeetracking` skill + [deploy/build.sh](../../deploy/build.sh).

## Goal
Ship the Windows installer as a public download and update marketing/SEO to position the
app as cross-platform (mac + Windows).

## Scope
- **Dual download**: add a "Download for Windows" button to the marketing landing page
  ([marketing/](../../marketing/)) alongside the macOS DMG; OS-detect to highlight the right one.
- **Stable link + cache-busting**: stage the signed `.exe` at
  `web/download/BiBoEmployeeTracking-Windows-x64.exe` with the same `?v=` cache-bust
  discipline as the DMG (see `deploy-employeetracking`).
- **deploy/build.sh**: stage the `.exe` into the served `web/download/` tree like the DMG.
- **SEO**: update JSON-LD `operatingSystem` to include Windows; add Windows keywords;
  ensure store/marketing copy reflects Windows support.
- Update docs (download instructions, system requirements: Win10 1809+ / Win11, x64).

## Acceptance criteria
- [ ] Landing page offers both macOS and Windows downloads; OS detection highlights correctly.
- [ ] Windows `.exe` is served at the stable path with working cache-bust.
- [ ] `deploy/build.sh` stages the `.exe`; a deploy publishes it (verify the live URL 200s).
- [ ] JSON-LD + keywords include Windows; copy is accurate.

## Notes
Gate the public link on signing (task 75) being done so first impressions aren't a
SmartScreen wall.
