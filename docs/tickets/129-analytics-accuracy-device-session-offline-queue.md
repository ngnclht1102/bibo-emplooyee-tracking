# 129 — Analytics accuracy: device-id session, shared client, offline queue

**Status:** Done
**Type:** Implementation (follow-up to [128](128-aptabase-analytics-plugin-crash.md))

## Background
128 fixed the *crash* (dropped the plugin, POST directly to Aptabase on Tauri's runtime),
but a code review of the shipped `analytics.rs` found a **data-accuracy bug** the
postmortem missed, plus two smaller cleanups.

## Problems
1. **Inflated DAU.** The event used `sessionId = Uuid::new_v4()` — a fresh random id on
   every launch. Aptabase derives unique-user / DAU counts from `sessionId`, so a device
   that opened the app N times/day registered as ~N users. The stated goal (DAU, version
   adoption, OS breakdown) was exactly the metric this distorted.
2. **Per-event client.** A new `reqwest::Client` was built on every call — harmless with
   one event/launch, but a footgun the moment a second event type is added.
3. **Silent loss when offline.** A launch with no network dropped the event entirely.

## Changes (`apps/desktop/src-tauri/src/analytics.rs`)
1. **Stable per-device session.** `sessionId = "<device_id>-<epoch_day>"`, using the
   existing stable `device_id` from `settings/mod.rs` (created once on first run, bucketed
   by UTC day). Each device now yields exactly one session per day → Aptabase daily metrics
   reflect **unique devices** (true DAU / adoption), not raw launch count.
2. **Single `reqwest::Client`** built once per flush and reused for the batch request.
3. **On-disk retry queue.** Switched to the plural batch endpoint
   (`https://eu.aptabase.com/api/v0/events`). On a failed/non-2xx send the event is written
   to `<data_dir>/analytics-queue/<uuid>.json`; the next launch reads the queue, sends
   queued + current events in one batch, and deletes the parked files only on a 2xx.
   Capped at `QUEUE_CAP = 50` (oldest dropped first, **logged** — no silent truncation);
   corrupt queue files are discarded on read.

Call site (`lib.rs`) now passes `device_id` and `data_dir.join("analytics-queue")`:
`track_app_started(locale, device_id, queue_dir)`.

## Verified
- `cargo check` clean (only the pre-existing unrelated `NeedsRestart` dead-code warning).

## Notes
- Best-effort throughout: every failure path is logged and the event re-queued, never
  propagated — analytics still can't affect app startup.
- No new dependencies (reuses `uuid`, `serde_json`, `time`, `os_info`, rustls `reqwest`).
- Metric change is forward-only; historical 1.3.1 data keeps the old per-launch sessions.
