# 156 — Desktop: SQLite environmental errors flooding Sentry; tao panic after loop destroyed (CTR-10..14)

**Sentry:**
- DESKTOP-RUST-W — `SqliteFailure: disk I/O error` (code 266, read; 259 events/24h, release 1.5.5) — CTR-10. https://asa-sq.sentry.io/issues/7769676231/
- DESKTOP-RUST-V — `SqliteFailure: disk I/O error` (code 778, write; release 1.5.5) — CTR-11. https://asa-sq.sentry.io/issues/7769676221/
- DESKTOP-RUST-10 — `SqliteFailure: disk I/O error` (code 1034, fsync; release 1.5.5) — CTR-12. https://asa-sq.sentry.io/issues/7784511647/
- DESKTOP-RUST-B — `SqliteFailure: database is locked` (code 5; release 1.6.0) — CTR-13. https://asa-sq.sentry.io/issues/7673250711/
- DESKTOP-RUST-7 — `panic: cannot move state from Destroyed` (Windows; release 1.6.0) — CTR-14. https://asa-sq.sentry.io/issues/7666700945/

## Cause
**CTR-10/11/12** are one machine with a sick disk (or a cloud-synced/sleeping volume): SQLite
extended codes 266/778/1034 are the read/write/fsync flavors of `SQLITE_IOERR`. All 259 events came
from a single ~1h burst on release 1.5.5. Nothing our code can do about the disk; each failed
activity-sample insert was `capture_error`'d, so one bad disk spams the project.

**CTR-13**: the local DB connection had no `busy_timeout`, so any short lock held by another
process (second app instance, antivirus/backup scanning the file) failed instantly with
`SQLITE_BUSY` and was reported.

**CTR-14**: same family as ticket 153 — a tao event-loop runner state assert on Windows. Stray
window messages dispatched after the runner reached `Destroyed` (subclassed wndproc pumped during
teardown, see the `DefSubclassProc`/`GetMessageW` frames) hit
`(Destroyed, _) => panic!("cannot move state from Destroyed")` in
`platform_impl/windows/event_loop/runner.rs`, crashing the app on exit.

## Fix
- `storage/mod.rs`: `busy_timeout(5s)` on the connection — short cross-process locks now wait
  instead of failing. (CTR-13)
- `storage/mod.rs` + `trackers/mod.rs`: new `storage::is_environmental()` classifier
  (`SQLITE_BUSY`, `SQLITE_LOCKED`, `SQLITE_FULL`→DiskFull, `SQLITE_IOERR`); environmental insert
  failures are still logged locally but no longer `capture_error`'d to Sentry. (CTR-10..13)
- tao fork `bibo-v0.35.3-no-flush-assert`: new commit `2186622` turns the `(Destroyed, _)` panic
  into a `warn!` + ignore (the loop is gone, nothing to handle). `Cargo.toml` patch rev +
  `Cargo.lock` bumped. Drop when upstream removes the asserts. (CTR-14)

## Status
- Hotfixed on `release/v1.6.0`, merged to `staging`.
