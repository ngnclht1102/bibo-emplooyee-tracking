# 164 — Sentry crash sweep CTR-18..36: startup survives a bad disk, extension noise dropped

**Date:** 2026-11-07 · **Status: Released in 1.7.3 (2026-11-09)** · issues **CTR-18 … CTR-36**

Second pass over the desktop Sentry backlog after tickets 152–156 (CTR-2..14). The whole
CTR-18..36 range was triaged; five were already fixed by earlier hotfixes and only showed up
again because the reporting build predated the fix.

## Already fixed — no work needed

| Issue | Why it's already handled |
|---|---|
| CTR-19 `SqliteFailure: database or disk is full` (1.5.8) | `is_environmental` (ticket 156) stopped reporting disk/lock insert failures from 1.6.0 on |
| CTR-24 `panic: cannot move state from Destroyed` (1.6.0) | tao fork rev `2186622` (ticket 156) — events came from a pre-hotfix 1.6.0 build |
| CTR-27 `panic: VP8_ENC_ERROR_OUT_OF_MEMORY` (1.5.1) | `encode_simple` + match (ticket 154) handles every encoder error, not just bad dimensions |
| CTR-31 `panic: VP8_ENC_ERROR_BAD_DIMENSION` (1.6.0) | same — pre-hotfix 1.6.0 build |
| CTR-35 backend `invalid byte sequence for encoding "UTF8": 0x00` (23 events) | `noNUL` / `noNULPtr` on the sync batch path, shipped in 1.7.0 (commit `9a28044`); events predate the deploy |

## Fixed here

### A bad database file no longer stops the app from starting (CTR-30, 32, 34, 36)
Startup did `Db::open(&path).expect("open database")`, so *any* failure opening the local
SQLite file was a crash before the window ever appeared. Four separate Sentry issues were
that one line:

- **CTR-36** `SystemIoFailure` / extended `4874` (`SQLITE_IOERR_SHMSIZE`) — failing or full disk.
- **CTR-34** `DatabaseBusy` — a lock held longer than the 5s `busy_timeout` (second instance,
  antivirus or backup scanning the file).
- **CTR-30** `NotADatabase` — the file isn't SQLite any more.
- **CTR-32** `SqlInputError: table activity_sample already exists` — a database whose
  `user_version` was lost, so migration 1 re-ran against tables that already existed.

`storage::Db::open_or_fallback` replaces it and degrades in four steps: open normally →
retry a locked file (3 × 1s) → move a corrupt/non-SQLite file aside as
`data.db.corrupt` (with its `-wal`/`-shm` sidecars, so a stale WAL can't corrupt the
replacement) and start fresh → as a last resort run on an **in-memory** database, which keeps
the app, tracking and backend sync working for the session and only loses the local buffer on
quit. Nothing is deleted while it can still be renamed; if the rename fails we take the
in-memory path rather than destroying data. One fixed `.corrupt` name, replacing any
earlier one, so a machine whose disk keeps eating the database can't pile up a full copy
per launch on a disk that is already in trouble.

The fallback is not silent to us: a failure that *isn't* environmental (a migration we got
wrong, say) is still reported to Sentry on the way past, so degrading gracefully doesn't
mean never hearing about our own bugs.

Both migrations are now re-runnable (`CREATE TABLE/INDEX IF NOT EXISTS`, and migration 2 adds
only columns that `PRAGMA table_info` says are missing), which is the actual fix for CTR-32 —
without it a lost `user_version` just moved the crash from migration 1 to migration 2.

`create_dir_all` for the app data dir no longer panics either; a full disk there falls through
to the same fallback.

### Corruption classed as environmental (CTR-22)
`is_environmental` gained `DatabaseCorrupt` and `NotADatabase`, so
`database disk image is malformed` during normal inserts is logged locally instead of
becoming a Sentry issue. At startup the file is quarantined and replaced (above), so this
self-heals rather than recurring forever.

### Extension noise dropped at the forwarder (CTR-18, 20, 21, 25, 29)
The extension forwards its errors to the desktop app, which reports them to Sentry. Five of
these issues were the user's Chrome or the user's disk, and every one embedded a tab id or a
file path in the message — which defeats Sentry's grouping, so one sick machine files a new
issue per event. `is_benign_extension_error` now drops:

- `No tab with id` (was already there) and **`Invalid tab ID`** — the same closed-tab race in
  a different Chrome wording (CTR-25).
- **`ChromeMethodBFE`** / `FILE_ERROR_` — anything out of Chrome's own leveldb layer:
  `FILE_ERROR_NO_SPACE` on a full disk (CTR-18), `LOCK: Access denied` when another Chrome
  holds the profile (CTR-29).
- **`QuotaExceededError` / `quota limitations`** — `chrome.storage.local` full (CTR-20).
- **`An unexpected error occurred`** — Chrome's placeholder with no stack, no API and no
  detail; it arrived in the same second as the quota errors above (CTR-21).

Dropped in the desktop app rather than in the extension because the extension ships through
the Chrome Web Store: store-installed copies keep sending until they auto-update.

### Dialog permissions restored (CTR-28)
`window.confirm` (delete task, delete/submit invoice) and the updater's `ask` prompt were
rejected with *"Command plugin:dialog|confirm not allowed by ACL"*. `tauri-plugin-dialog` is
pinned as `"2"` and its `dialog:default` set shrank to `allow-message`/`allow-save`/`allow-open`
somewhere before 2.7.1, silently dropping `ask` and `confirm`. Added `dialog:allow-ask` and
`dialog:allow-confirm` to the capability.

> This also un-breaks the **"Restart now" update prompt** (tickets 131/136) on Windows — it
> calls `ask`, so it was failing for the same reason.

### Two more Windows asserts in the tao fork turned into warnings (CTR-23, CTR-33)
Same family as CTR-3 and CTR-14: asserts that are reasonable in a debug build and fatal in a
shipped app. Fork commit `2a78cd0` on `bibo-v0.35.3-no-flush-assert`, rev bumped here.

- **CTR-23** `either event handler is re-entrant (likely), or no event handler is registered`
  — `call_event_handler` takes the handler out of its cell, so a window message pumped from
  *inside* the handler (subclassed wndproc during teardown, a modal loop) found it missing and
  panicked. Now it puts the control flow back and drops the nested event.
- **CTR-33** `assertion failed: subclass_result.as_bool()` — `SetWindowSubclass` failing (the
  window is already gone, or the OS refused the hook) killed the app at both call sites. Now
  logged; the app carries on without that hook.

Verified with `cargo check --target x86_64-pc-windows-msvc` on the fork, default and
`--all-features`, both clean. The app's own Windows build can't be cross-checked from the Mac
(`ring`'s build script needs a Windows C toolchain) — it builds on `winbuild` as usual.

## Left open, with reasons

- **CTR-26** `panic: Failed to setup app: failed to create webview: WebView2 error 0x800705B4
  (timeout)` — the panic is inside `tauri`'s own event-loop Ready callback
  (`app.rs:1417`), not in our code, and the app genuinely cannot run without a webview.
  Unfixable without forking tauri; single event, release 1.5.1.

Not addressed: the app doesn't *tell* the user when it falls back to an in-memory database.
Worth a small banner later (needs copy in 7 locales).

## Test instructions
```
cd apps/desktop/src-tauri && cargo test          # 34 pass, incl. the 6 new cases below
```
New automated coverage:
- `storage::open_or_fallback_opens_a_fresh_file`
- `storage::open_or_fallback_quarantines_a_corrupt_file` — junk file + stale `-wal` → working DB, original bytes kept
- `storage::open_or_fallback_falls_back_to_memory` — unopenable path → working in-memory DB, no panic
- `storage::migration_1_reruns_on_existing_tables` — `user_version` reset to 0 → reopens clean
- `server::benign_extension_errors_are_dropped` — the five real Sentry messages
- `server::real_extension_errors_still_reported` — genuine bugs still get through

Manual (needs a Windows box or a full volume):
- Delete `data.db` content (`echo junk > data.db`) → app starts, `data.db.corrupt` appears next to it.
- Task → Delete → the confirm dialog appears (CTR-28).

## Definition of Done
- [x] `cargo check` + `cargo test` green (34 pass); `cargo clippy` clean on the changed modules
- [ ] Manual steps above
- [ ] Committed
