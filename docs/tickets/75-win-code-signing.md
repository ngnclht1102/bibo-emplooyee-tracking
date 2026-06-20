# 75 — M4b: Authenticode code signing

- **Phase:** 6
- **Type:** Implementation
- **Status:** Blocked
- **Blocked by:** 74
- **Blocks:** 76

> Plan: [docs/12-windows-support-plan.md](../12-windows-support-plan.md) §6, §7.2, §8.

## Goal
Sign the Windows installer + app binary with **Authenticode** so SmartScreen/Defender
don't block the download. `signtool` (Win SDK 10.0.26100) is already on `winbuild`.

## Scope
- **Decision (open §7.2):** pick a signing approach and record why —
  - Azure Trusted Signing (cheap, Microsoft-managed, good reputation) — *recommended*;
  - OV cert (cheap; SmartScreen reputation accrues over time);
  - EV cert (instant SmartScreen trust; pricier).
- Wire signing into the task-74 build:
  - Either Tauri's built-in Windows signing config (`signCommand`/cert thumbprint), or a
    post-build `signtool sign /fd SHA256 /tr <timestamp-url> /td SHA256 ...` step over SSH.
  - Sign **both** the app `.exe` and the NSIS installer; include an RFC-3161 timestamp.
- Keep secrets off the repo (cert/credential on the PC or via Azure; reference, don't commit).
- Document verification: `signtool verify /pa /v <file>` shows a valid chain + timestamp.

## Acceptance criteria
- [ ] Installer and app binary are signed; `signtool verify /pa` passes with a timestamp.
- [ ] Signing approach + cost/tradeoff recorded in the tracker (§7.2 resolved).
- [ ] Signing runs as part of the `build-desktop-exe` skill (or a clearly documented step).
- [ ] No secrets committed to the repo.

## Notes
We can ship/test **unsigned** first (task 74) and add signing before the public download
goes live (task 77).
