# 93 — Hard screenshot retention cap (backend, cost control)

- **Phase:** 8
- **Type:** Implementation
- **Status:** Ready
- **Blocked by:** 47
- **Blocks:** —

## Goal
Bound on-disk screenshot growth on the low-cost production VPS by enforcing a
**hard global retention ceiling of 3 days** on the backend, independent of any
per-business `screenshot_retention_days`. Today the sweeper (task 47) only touches
businesses with a *non-null* retention — a business that never set one keeps
screenshots **forever**, which fills the box. This adds a backend-side floor so disk
is bounded no matter what clients/owners configure.

## Background
- [internal/retention/retention.go](../../apps/backend/internal/retention/retention.go)
  — `SweepAll` iterates only `store.BusinessesWithRetention(ctx)` (non-null days),
  hourly via `StartSweeper`. Null-retention businesses are skipped entirely.
- Per-machine screenshots are ≤ 50 KB, captured every ~5 min
  ([trackers/mod.rs](../../apps/desktop/src-tauri/src/trackers/mod.rs)). At ~150 MB
  per machine over 30 days, an 80 GB VPS caps out around a few hundred machines;
  a 3-day cap cuts steady-state storage ~10× and makes disk a non-issue.
- This is a deployment/cost guardrail, **not** a replacement for the owner-facing
  retention control (task 65) — it is a *maximum*, applied on top.

## Scope
- **Config:** add `SCREENSHOT_MAX_RETENTION_DAYS` env (see
  [internal/config/config.go](../../apps/backend/internal/config/config.go)),
  default `3`. `0` / unset on the deployed box → `3`. A value of `-1` disables the
  cap (keeps current per-business-only behavior) for dev/local.
- **Sweep:** `SweepAll` must apply the cap to **every** business, including those
  with null retention:
  - Null retention → use the cap (`3`).
  - Non-null retention → `min(business_days, cap)` so an owner cannot retain longer
    than the global ceiling.
  - Effectively: change `BusinessesWithRetention` usage so the sweep covers **all**
    businesses, deriving each one's effective cutoff = `min(coalesce(days, cap), cap)`.
- **Manual endpoint** (`POST /v1/businesses/:id/screenshots/cleanup`) is unchanged,
  but an explicit `older_than_days` larger than the cap is clamped to the cap.
- Wire the configured cap into `StartSweeper` setup at server startup.
- Keep the hourly sweep interval; the cap only changes the cutoff math.

## Acceptance criteria
- [ ] A business with **null** `screenshot_retention_days` has screenshots older than
      3 days deleted (rows + files) by the scheduled sweep.
- [ ] A business set to 30 days is effectively capped at 3 — shots older than 3 days
      are removed despite the higher setting.
- [ ] A business set to 1 day still uses 1 day (cap is a ceiling, not a floor).
- [ ] `SCREENSHOT_MAX_RETENTION_DAYS=-1` restores task-47 behavior (per-business only,
      null = keep forever) for local/dev.
- [ ] Manual cleanup with `older_than_days=30` is clamped to the cap (3) when the cap
      is active; returns accurate `{deleted_count, bytes_freed}`.
- [ ] Files removed before rows; a missing file doesn't crash the sweep (unchanged).
- [ ] Cap value is logged once at startup so the deployed setting is auditable.

## Deploy notes
- Set `SCREENSHOT_MAX_RETENTION_DAYS=3` in the production `.env` (the VPS deploy).
- Pairs with the cheap-VPS rollout; with a 3-day cap the 80 GB SSD4 box holds many
  hundreds of machines on screenshots alone.

## Out of scope
- Activity/keystroke/browser row retention (DB growth) — separate ticket if needed.
- Per-business UI changes (owner control lives in task 65).
