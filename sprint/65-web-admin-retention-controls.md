# 65 — Web admin: screenshot retention controls

- **Phase:** 5
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** 47, 61
- **Blocks:** —

> Retention presets already shipped in task 63's Settings page. This adds the manual
> "Clean up now…" row + a confirmation Modal (age presets 7/14/30/90), calling
> `POST /v1/businesses/:id/screenshots/cleanup?older_than_days=N` via a new
> `cleanupScreenshots` endpoint; result shows deleted count + bytes freed
> (`formatBytes`). Typecheck + build clean.

## Goal
Owner UI for screenshot retention + manual cleanup, per
[docs/11-backend-and-sync.md](../docs/11-backend-and-sync.md).

## Scope
- Retention setting (presets 7 / 14 / 30 / 90 / Never) → `PATCH /v1/businesses/:id/settings`.
- **"Clean up now"** button → `POST /v1/businesses/:id/screenshots/cleanup?older_than_days=N`,
  with a confirmation dialog (destructive) and a result toast (deleted count, freed space).
- Show current retention + an estimate of storage used.

## Acceptance criteria
- [ ] Changing retention persists and reflects on reload.
- [ ] "Clean up now" prompts for confirmation, then reports deleted count + freed space.
- [ ] After cleanup, the gallery (task 63) no longer shows removed screenshots.
- [ ] Only the owner can change retention / run cleanup.
