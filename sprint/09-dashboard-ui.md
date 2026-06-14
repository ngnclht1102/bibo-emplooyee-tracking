# 9 — Dashboard UI (stat cards, timeline, app breakdown)

- **Phase:** 1
- **Type:** Implementation
- **Status:** Blocked
- **Blocked by:** 3, 7
- **Blocks:** 10

## Goal
The default screen showing today's activity, per
[docs/07-ui-design.md](../docs/07-ui-design.md) and the design prompt.

## Scope
- App shell: sidebar nav (Dashboard, Screenshots, Browser, Activity, Settings) +
  header with date and a Pause/Resume tracking toggle.
- Stat cards: Active time today, Top app (+ more as data allows).
- Day **timeline** of active app over the day; apps differentiated by tone/opacity
  (not rainbow); idle gaps shown empty/hatched.
- App **breakdown** list/table: app, active time, thin % bar, tabular numbers.
- Tauri commands to query `activity_sample` for a given day.
- All time shown is **active time only**.

## Acceptance criteria
- [ ] Dashboard reflects real `activity_sample` data for today.
- [ ] Timeline + breakdown update as new activity is recorded.
- [ ] Idle gaps are visible and labeled.
- [ ] Looks correct in dark and light themes; tokens only.
- [ ] Pause/Resume actually stops/starts tracking.
