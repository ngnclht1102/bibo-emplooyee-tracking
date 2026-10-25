# 155 — Desktop: drop benign extension errors at the forwarder; fork builds polluting Sentry (CTR-5..8)

**Sentry:**
- DESKTOP-RUST-19 — `No tab with id: 7036599.` (release 1.6.0, real user) — CTR-5. https://asa-sq.sentry.io/issues/7791208338/
- DESKTOP-RUST-16 — `tracker poll loop stalled` (release **1.11.4**, level info) — CTR-6. https://asa-sq.sentry.io/issues/7789517765/
- DESKTOP-RUST-1E/1F — `browser sign-in failed: network error (workflow-back-test.ienetworks.co)` (releases **1.7.2/1.7.3**, level warning) — CTR-7/8. https://asa-sq.sentry.io/issues/7808215785/

## Cause
**CTR-5** is the same closed-tab race as ticket 152: the extension fix (`b6968ef`) ships via the
Chrome Web Store, so store-installed extensions keep sending `No tab with id: X` to the desktop's
`/report-error` until they auto-update — and each tab id groups as a *new* Sentry issue.

**CTR-6/7/8 are not our code.** The messages `tracker poll loop stalled` and `browser sign-in
failed` exist in no branch of this repo, the releases (1.7.2, 1.7.3, 1.11.4) are above anything we
shipped (1.6.0), and the sign-in URL is `workflow-back-test.ienetworks.co`. Two third-party forks of
the open-source app (ienetworks.co, ivoyant.com users) kept our Sentry DSN, so their builds report
into our project.

## Fix
- Desktop `server/mod.rs` `report_error`: drop messages containing `No tab with id` before
  forwarding to Sentry (defense in depth behind the extension fix). (CTR-5)
- BiboRemoteWork `bibowatch`: the Sentry source now queries `level:[error,fatal]` only, and skips
  issues whose latest event release is above the published desktop version (read from
  `bibotracker.com/download/latest.json`), so fork builds stop becoming tickets. (CTR-6/7/8)

Nothing in our shipped code can stop the forks from sending events (the DSN is public in an
open-source repo); rotating the DSN would also cut off our own deployed builds. Release-based
inbound filtering on the Sentry side is a paid-plan feature.

## Status
- Hotfixed on `release/v1.6.0`, merged to `staging`.
