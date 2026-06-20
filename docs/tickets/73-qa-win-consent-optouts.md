# 73 — QA: Windows consent + Settings opt-outs

- **Phase:** 6
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 72
- **Blocks:** 79

## Goal
Confirm the Windows consent flow and opt-out toggles work, and macOS is unaffected.

## Interactive checklist
### Windows (via Parsec on `winbuild`)
- [ ] Fresh profile → first launch shows the consent screen; no screenshots/keystrokes
      captured before consenting.
- [ ] After consent, capture starts; consent isn't shown again on relaunch.
- [ ] Settings → toggle "Capture screenshots" off → no new screenshots; on → resumes.
- [ ] Settings → toggle "Count keystrokes" off → counts stop; on → resumes.
- [ ] Apply an org capture policy → toggles lock (can't override), matching macOS.
- [ ] No macOS-only wording ("Input Monitoring", "Screen Recording") shown anywhere.

### macOS regression
- [ ] Permissions screen still shows the 3 TCC rows with working prompts + deep links.
- [ ] Grant/deny states update correctly; no visual/behavioral change vs. before.

## Pass condition
All boxes checked. Any failure → reopen task 71 (backend) or 72 (UI) as appropriate.
