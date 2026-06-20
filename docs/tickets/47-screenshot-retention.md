# 47 — Screenshot retention cleanup (backend)

- **Phase:** 5
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** 43
- **Blocks:** 65

## Goal
Owner-controlled screenshot cleanup per
[docs/11-backend-and-sync.md](../11-backend-and-sync.md).

## Scope
- `internal/retention`: delete `screenshots` rows **and** their files older than a
  cutoff for a business; remove file before the row; uuid-path only.
- Manual: `POST /v1/businesses/:id/screenshots/cleanup?older_than_days=N` → returns
  `{deleted_count, bytes_freed}`. Owner-only.
- Scheduled sweep: hourly ticker over businesses with non-null
  `screenshot_retention_days`, applying their cutoff.
- Reuses `screenshot_retention_days` from `PATCH .../settings` (task 39).

## Acceptance criteria
- [ ] Manual cleanup removes rows + files older than N days; returns accurate counts.
- [ ] Scheduled sweep honors each business's retention; null = keeps everything.
- [ ] Files removed before rows; a missing file doesn't crash the sweep.
- [ ] Only the owner can trigger manual cleanup (403 otherwise).
- [ ] Cleanup only touches the target business's storage subtree.
