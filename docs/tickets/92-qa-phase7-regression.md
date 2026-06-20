# 92 — Phase 7 regression QA

- **Phase:** 7
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 86, 89, 91

## Checks
End-to-end, per persona, on macOS and Windows (`ssh winbuild`).

- [ ] **Personal:** web shows download CTA (no account); desktop "Use locally" →
      onboarding (personal copy, all toggles free) → dashboard. No network calls.
- [ ] **Manager:** web wizard creates `manager`/`team`; create an employee; that
      employee logs in on desktop → onboarding shows employee copy + locked rows.
- [ ] **Parent:** web wizard creates `parent`/`family`; a "kid" logs in on desktop →
      onboarding shows kid copy.
- [ ] Signup link from desktop opens the web wizard.
- [ ] Extension install guide → pair → activity table.
- [ ] Logo + gradient consistent on welcome surfaces; dashboards/tables remain flat.
- [ ] Onboarding shows once per install; relaunch goes straight to dashboard.
