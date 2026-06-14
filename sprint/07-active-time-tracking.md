# 7 — Active-time tracking (active window + idle, active-only)

- **Phase:** 1
- **Type:** Implementation
- **Status:** Blocked
- **Blocked by:** 5
- **Blocks:** 8, 9

## Goal
Record foreground app/window into `activity_sample`, counting **active time only** —
idle/locked/asleep time is excluded. Per the *Idle detection* section in
[docs/01-architecture.md](../docs/01-architecture.md).

## Scope
- `ActiveWindowTracker`: poll ~1s for foreground app name + window title + pid
  (`active-win-pos-rs`). App name works without permission; window title needs
  Accessibility (null otherwise — acceptable here).
- Interval coalescing: write a row only when the active window changes, accumulating
  `duration_s`.
- `IdleMonitor`: seconds since last input via `CGEventSourceSecondsSinceLastEventType`.
  Default idle threshold **60s** (configurable later).
- Stop accumulating when: idle ≥ threshold, screen locked, or display/system asleep.
  Resume input → start a fresh interval.
- Optional retroactive trim so the interval ends at last real input, not detection.

## Acceptance criteria
- [ ] Switching apps creates/closes intervals with correct app + title.
- [ ] `duration_s` reflects active time only — going idle stops the count.
- [ ] Locking the screen / sleeping the display stops counting.
- [ ] Returning from idle starts a new interval, not extends the old one.
- [ ] Idle threshold is read from config (default 60s).
