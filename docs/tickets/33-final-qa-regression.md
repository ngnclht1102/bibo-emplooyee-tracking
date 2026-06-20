# 33 — Final full QA regression pass

- **Phase:** 4
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** all above (1–32)
- **Blocks:** —

## Goal
End-to-end interactive regression across all features and supported macOS versions
before calling v1 done.

## Interactive checklist
- [ ] Fresh install on a clean machine: first-run permissions flow works to
      completion (all three granted).
- [ ] Full day of real use: dashboard, activity chart, screenshots, browser activity
      all reflect reality; time is active-only.
- [ ] Privacy audit: no keystrokes stored; no network egress except explicit export;
      domain-only mode honored.
- [ ] Export CSV + JSON with a date range; files correct.
- [ ] Retention/cleanup keeps storage bounded.
- [ ] Theme light/dark/system correct across every screen.
- [ ] **Version matrix:** repeat the core smoke test on macOS 26 (primary), 15, and
      the 13 floor — especially screenshot capture and permission flows.
- [ ] Mid-run permission revocation handled gracefully on each.
- [ ] Universal binary runs on Apple Silicon and Intel; app is signed/notarized.

## Pass condition
All boxes checked on all target versions. Any failure → reopen the specific feature
task and re-run its QA before re-attempting this pass.
