# Data model (SQLite)

Single local SQLite file (e.g. `~/Library/Application Support/ctracking/data.db`).
Screenshot images live on disk; only their paths are stored in the DB.

## Tables

```sql
-- One row per contiguous interval a given app/window was in the foreground.
CREATE TABLE activity_sample (
    id            INTEGER PRIMARY KEY,
    ts            INTEGER NOT NULL,   -- unix epoch (start of interval)
    app_name      TEXT    NOT NULL,
    window_title  TEXT,               -- may be null if Accessibility not granted
    pid           INTEGER,
    duration_s    INTEGER NOT NULL    -- ACTIVE seconds only; idle/locked/asleep time excluded
);
CREATE INDEX idx_activity_ts ON activity_sample(ts);

-- Keypress counts per time bucket. NO keys/characters are ever stored.
CREATE TABLE keystroke_bucket (
    id         INTEGER PRIMARY KEY,
    ts_bucket  INTEGER NOT NULL,      -- start of the N-minute bucket (unix epoch)
    count      INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_keystroke_bucket ON keystroke_bucket(ts_bucket);

-- Mouse activity is optional/future; same shape as keystroke_bucket if added.

-- Periodic screenshots. Image bytes on disk, path recorded here.
CREATE TABLE screenshot (
    id          INTEGER PRIMARY KEY,
    ts          INTEGER NOT NULL,
    file_path   TEXT    NOT NULL,
    display_id  INTEGER,
    width       INTEGER,
    height      INTEGER
);
CREATE INDEX idx_screenshot_ts ON screenshot(ts);

-- Browser page visits reported by the extension.
CREATE TABLE browser_visit (
    id          INTEGER PRIMARY KEY,
    ts          INTEGER NOT NULL,     -- when the page became active
    url         TEXT    NOT NULL,
    page_title  TEXT,
    browser     TEXT,                 -- "chrome" | "edge" | ...
    duration_s  INTEGER NOT NULL      -- time spent on the page
);
CREATE INDEX idx_browser_visit_ts ON browser_visit(ts);
```

## Design notes

- **Interval coalescing.** `ActiveWindowTracker` polls ~1s but only writes a row
  when the active window changes, accumulating `duration_s`. Keeps the table small.
- **Active-only duration.** `duration_s` counts **only time the user was actively
  present**. When the session goes idle (no input ≥ threshold), locked, or asleep,
  the interval stops growing; resuming input starts a fresh interval. So summing
  `duration_s` yields real active time, not wall-clock. See *Idle detection* in
  [01-architecture.md](01-architecture.md).
- **Idempotent keystroke buckets.** Upsert on `ts_bucket` so a flush can add to an
  existing bucket. Counts only — privacy by construction.
- **Screenshots off-DB.** Keeping images on disk keeps the DB light and makes the
  retention/cleanup job a simple file + row delete.
- **Browser durations** come from the extension diffing tab-active timestamps; the
  Rust side just persists what it receives.

## Export

- **CSV** — one file per table (or a zip), straightforward to open in spreadsheets.
- **JSON** — a single document for programmatic use.
- Export is user-triggered and is the only path by which data leaves the machine.
