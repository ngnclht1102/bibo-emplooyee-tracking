# 26 — QA: browser extension end-to-end

- **Phase:** 3
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 25
- **Blocks:** —

## Goal
Confirm the extension reports accurate per-page time and recovers from port changes.

## Interactive checklist
- [ ] Load the unpacked extension; browse several pages for known durations.
- [ ] `browser_visit` rows show correct URL, title, and roughly correct time-on-page.
- [ ] Switch to another app / unfocus the browser — that time is **not** counted.
- [ ] SPA navigation (e.g. Gmail) records distinct pages, not one blob.
- [ ] Restart the app so it picks a different port — extension re-discovers and keeps
      posting (check after occupying the original port).
- [ ] Close the app — extension fails gracefully and recovers when it returns.
- [ ] Works in both Chrome and Edge.

## Pass condition
All boxes checked. Any failure → reopen task 25.
