# 135 — Aptabase: 1.3.x direct-API events not landing (ROOT-CAUSED + fixed)

**Status:** Root cause found + fixed in code (1.3.8). macOS ship pending winbuild (LAN box
unreachable 2026-06-23 — holding the release so mac+Windows ship together).
**Type:** Bug / Investigation

## ROOT CAUSE (confirmed 2026-06-23)
The `sessionId` introduced in **1.3.2** (commit `a1c22fb`) was a **stable per-day key**
`<device_id>-<epoch_day>` — one id reused for every event, all day. Aptabase treats
`sessionId` as a real, short-lived session (its SDKs rotate it after ~1h idle), so it
**merges/drops repeat posts** under an id it has already seen → the real app's events
returned `200` but never materialised.

**Why 1.3.1 worked (and is still visible):** 1.3.1 (commit `e89d1b0`) used a fresh
`Uuid::new_v4()` **per launch** — exactly what Aptabase expects. The regression landed at
1.3.2 and rode through 1.3.7.

**Confirming A/B test (2026-06-23):** two identical events sent to `/api/v0/events`, same
timestamp + real systemProps (appVersion `1.3.7-ABTEST`), differing ONLY in sessionId:
- A = `<real device_id>-<epoch_day>` (the daily key today's app uses) → **did NOT land**.
- B = fresh UUID → **landed** (one `1.3.7-ABTEST` row appeared in User Sessions).
One row, not two → the daily-key twin was dropped. Rules out the timestamp/nanosecond,
free-tier-retention, and isDebug theories (1.3.1 shares the identical timestamp code path).

## FIX (1.3.8)
Replaced the daily key with a fresh per-launch UUID (`analytics::AnalyticsSession`, minted
once in `lib.rs` setup, `app.manage`d) shared by the native launch/focus events AND the
web-UI `track_event` command, so all events in one run batch under one session. Touched:
`analytics.rs` (struct + `build_event`/`track_*` take `session_id`), `lib.rs` (mint+manage,
focus handler, `track_app_started`), `commands/mod.rs` (read session from state). DAU stays
accurate — Aptabase counts unique users server-side, not raw sessionIds. `cargo check` clean.

**Ship status:** version bumped to 1.3.8 across all manifests + committed. Build/deploy held
until `winbuild` is reachable so mac + Windows release together (per BossBrian, 2026-06-23).

---
## Original investigation notes (pre-fix)
**Project:** bibotracker (Aptabase EU, App Key `A-EU-4411171274`,
dashboard `https://eu.aptabase.com/cR6B4JLtJ5xCUS2KznGJQD`)

## Symptom
Product-analytics events from our **direct-API** implementation (1.3.1+, `analytics.rs`)
do **not** reliably appear in the Aptabase dashboard. After updating to **1.3.7** and using
the app, **no 1.3.7 session/event ever showed up**, even after waiting hours.

## What we know works
- Our request format **does ingest**: hand-crafted `curl` probes (appVersions 6.6.6–9.9.1)
  — including one matching our app **exactly** (plural `/api/v0/events` batch, minimal
  systemProps, no User-Agent) — **showed up in Live View / User Sessions** ~20–30 min after
  sending. So endpoint + key + payload are accepted and stored.
- Real **1.3.1** sessions (macOS 26.1.0, this machine) also appeared at one point.
- The 1.3.7 build emits correctly locally: app log shows `[app_started] -> 200 OK` and
  `[app_active] -> 200 OK` (event name added to the success log in 1.3.7).
- **No failed sends**: `~/Library/Application Support/com.briannguyen.bibotracking/
  analytics-queue/` is empty (failures would queue there and retry).

## Ruled out
- App Key correct (`A-EU-4411171274` = bibotracker, confirmed on Instructions page).
- Clock skew — server `Date` header == local time, exact.
- Geo/IP block — egress is Viettel ADSL residential, Ho Chi Minh (`171.236.49.185`), same
  region as the one event that always shows.
- Endpoint — both singular `/api/v0/event` and plural `/api/v0/events` return `200 {}` and
  both ingested in probes.
- systemProps completeness, `User-Agent`, `engineName/engineVersion` — full-props +
  plugin-style UA probe (6.6.6) ingested, but so did the minimal one; not required.
- Plan/quota — nothing limiting on app Settings.

## The core mystery (for tomorrow)
1. **1.3.7 real-app events never appeared**, despite identical-format curl probes landing
   and local logs showing `200 OK`. Why do hand-sent probes ingest but the real app's
   events don't?
2. **Dashboard is eventually-consistent / flaky**: data that was visibly present (a 9-row
   User Sessions list incl. 1.3.1 + all curl probes) **later vanished** from the 24h
   Dashboard, which reverted to showing a single old `app_started` / v1.3.0 event. Debug
   toggle on/off made no difference. Live View intermittently shows "No users in the last
   hour" even right after sends.

### Leading theories to test next
- **Aptabase free-tier ingestion/retention quirk** — events accepted (200) then dropped or
  rolled off; possibly an event-volume cap or sampling. Check Aptabase plan limits / open a
  support question.
- **Session bucketing**: our `sessionId = "<device_id>-<epoch_day>"` is reused all day. If
  Aptabase dedupes/expires by sessionId oddly, repeated same-session events may be merged or
  discarded. Try a per-launch (or per-30min) sessionId and compare.
- **isDebug routing**: release builds send `isDebug=false`; confirm which view (prod vs
  Debug) the real events should land in and whether the toggle is filtering as expected.
- **Timestamp precision**: app sends RFC3339 with up to nanosecond fraction
  (`time` crate); probes used milliseconds. Test whether nanosecond fractions are rejected.

## Repro / debugging aids
- Trigger events on 1.3.7: launch (`app_started`); switch away & back >30s apart
  (`app_active`, throttled 30s); click sidebar/buttons (`ui_click`, props `label`+`screen`).
- Watch live: app log success line is `flushed N event(s) [<event>] -> 200 OK`.
- Dashboard views: Live View (`/live`, last hour), User Sessions (`/sessions`), Dashboard
  (`?period=24h`). Expect 20–30 min reporting lag and inconsistency.

## Shipped alongside (already done, not part of this bug)
- 1.3.7 fixed `app_active` (was wired to a DOM `window` focus event that never fires in the
  Tauri webview → moved to native `WindowEvent::Focused`). See [134](134-fix-app-active-native-focus.md).

## Next step
Resume 2026-06-23: re-check the dashboard after the overnight wait (does 1.3.7 finally show
with a long delay?), then test the sessionId / timestamp theories if still missing.
