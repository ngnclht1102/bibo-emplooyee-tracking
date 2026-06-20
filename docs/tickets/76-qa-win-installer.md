# 76 — QA: Windows installer + SmartScreen

- **Phase:** 6
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 75
- **Blocks:** 79

## Goal
Confirm the signed installer installs cleanly and isn't blocked by SmartScreen/Defender.

## Interactive checklist
- [ ] Download the signed `.exe` on a clean Win10 and Win11 box (or VM).
- [ ] SmartScreen behavior is acceptable for the chosen cert (EV: no warning; OV/Trusted
      Signing: warning diminishes / publisher shown). Record what appears.
- [ ] Defender does not quarantine the installer or app.
- [ ] Install as a **standard** user and as an **admin** — both succeed (or document the
      required mode).
- [ ] App launches post-install; auto-creates data dir; tray icon present.
- [ ] Uninstall removes the app cleanly (Programs & Features / NSIS uninstaller).
- [ ] `signtool verify /pa /v` passes on the downloaded artifact.

## Pass condition
All boxes checked. SmartScreen/Defender behavior matches the chosen signing tier. Any
failure → reopen task 74 (build) or 75 (signing).
