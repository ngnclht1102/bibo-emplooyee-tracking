# 8 — QA: active-time tracking

- **Phase:** 1
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 7
- **Blocks:** —

## Goal
Confirm active-only time counting behaves correctly in real use.

## Interactive checklist
- [ ] Use a few apps for ~1 min each; confirm `activity_sample` rows match what you
      did (app, title, roughly correct durations).
- [ ] Stop touching the keyboard/mouse past the idle threshold — confirm the count
      **stops** (duration doesn't keep growing).
- [ ] Resume input — confirm a **new** interval starts.
- [ ] Lock the screen for a minute — confirm that time is **not** counted.
- [ ] Let the display sleep — confirm no counting during sleep.
- [ ] With Accessibility NOT granted, app names still record (titles may be null);
      with it granted, titles populate.

## Pass condition
All boxes checked. Any failure → reopen task 7.
