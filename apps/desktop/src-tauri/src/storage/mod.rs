//! Local SQLite storage (see docs/02-data-model.md).
//!
//! Owns the database connection and typed insert/query helpers for:
//! `activity_sample`, `keystroke_bucket`, `screenshot`, `browser_visit`.
//!
//! Concurrency: a single connection behind a `Mutex`. Trackers run on background
//! threads, so all access goes through `&Db` methods that lock briefly. WAL mode
//! is enabled so reads don't block the occasional write.

use std::path::Path;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection};
use serde::Serialize;
use uuid::Uuid;

/// Latest schema version. Bump when adding a migration below.
const SCHEMA_VERSION: i64 = 2;

/// A fresh client-generated UUID (v4), the backend's natural sync key.
fn new_uuid() -> String {
    Uuid::new_v4().to_string()
}

/// Current unix time in seconds, used for `updated_at` bookkeeping.
fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub type Result<T> = std::result::Result<T, rusqlite::Error>;

/// Handle to the local database. Cheap to share via `Arc` / Tauri state.
pub struct Db {
    conn: Mutex<Connection>,
}

// ---------- row types ----------

#[derive(Debug, Clone, Serialize)]
pub struct ActivitySample {
    pub ts: i64,
    pub app_name: String,
    pub window_title: Option<String>,
    pub pid: Option<i64>,
    /// Active seconds only — idle/locked/asleep time excluded (see docs/01).
    pub duration_s: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Screenshot {
    pub ts: i64,
    pub file_path: String,
    pub display_id: Option<i64>,
    pub width: Option<i64>,
    pub height: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BrowserVisit {
    pub ts: i64,
    pub url: String,
    pub page_title: Option<String>,
    pub browser: Option<String>,
    pub duration_s: i64,
}

// ---------- pending-sync row types (synced = 0) ----------
//
// These carry the sync bookkeeping (`client_uuid`, `updated_at`) the worker (task
// 53) sends to the backend; the time-range row types above stay UI-facing and
// unchanged.

#[derive(Debug, Clone, Serialize)]
pub struct PendingActivity {
    pub client_uuid: String,
    pub ts: i64,
    pub app_name: String,
    pub window_title: Option<String>,
    pub pid: Option<i64>,
    pub duration_s: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct PendingKeystroke {
    pub client_uuid: String,
    pub ts_bucket: i64,
    pub count: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct PendingBrowser {
    pub client_uuid: String,
    pub ts: i64,
    pub url: String,
    pub page_title: Option<String>,
    pub browser: Option<String>,
    pub duration_s: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct PendingScreenshot {
    pub client_uuid: String,
    pub ts: i64,
    pub file_path: String,
    pub display_id: Option<i64>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub updated_at: i64,
}

impl Db {
    /// Open (creating if needed) the database at `path` and run migrations.
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        Self::from_conn(conn)
    }

    /// In-memory database — used by tests.
    #[cfg(test)]
    pub fn open_in_memory() -> Result<Self> {
        Self::from_conn(Connection::open_in_memory()?)
    }

    fn from_conn(conn: Connection) -> Result<Self> {
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        let db = Db {
            conn: Mutex::new(conn),
        };
        db.migrate()?;
        Ok(db)
    }

    /// Idempotent, versioned migrations keyed on SQLite's `user_version`.
    fn migrate(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let mut version: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;

        if version < 1 {
            conn.execute_batch(MIGRATION_1)?;
            version = 1;
        }

        if version < 2 {
            Self::migrate_2(&conn)?;
            version = 2;
        }

        conn.pragma_update(None, "user_version", version)?;
        debug_assert_eq!(version, SCHEMA_VERSION);
        Ok(())
    }

    /// Migration v2: add sync bookkeeping (`client_uuid`, `synced`, `updated_at`) to
    /// the four activity tables, backfill existing rows with fresh uuids, and add a
    /// partial index per table for cheap "what's pending" scans. See docs/11.
    ///
    /// `client_uuid` can't be added as `NOT NULL UNIQUE` in one ALTER on a populated
    /// table, so we add a nullable column, backfill, then enforce uniqueness via a
    /// unique index. SQLite keeps `synced`/`updated_at` `NOT NULL` because we supply
    /// a constant default that also applies to existing rows.
    fn migrate_2(conn: &Connection) -> Result<()> {
        const TABLES: [&str; 4] = [
            "activity_sample",
            "keystroke_bucket",
            "screenshot",
            "browser_visit",
        ];
        let now = now_secs();
        for table in TABLES {
            conn.execute_batch(&format!(
                "ALTER TABLE {table} ADD COLUMN client_uuid TEXT;
                 ALTER TABLE {table} ADD COLUMN synced INTEGER NOT NULL DEFAULT 0;
                 ALTER TABLE {table} ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;"
            ))?;

            // Backfill: give every existing row a uuid and a sane updated_at.
            {
                let mut ids = Vec::new();
                {
                    let mut stmt =
                        conn.prepare(&format!("SELECT id FROM {table} WHERE client_uuid IS NULL"))?;
                    let rows = stmt.query_map([], |r| r.get::<_, i64>(0))?;
                    for id in rows {
                        ids.push(id?);
                    }
                }
                for id in ids {
                    conn.execute(
                        &format!(
                            "UPDATE {table} SET client_uuid = ?1, updated_at = ?2 WHERE id = ?3"
                        ),
                        params![new_uuid(), now, id],
                    )?;
                }
            }

            // Enforce the global key + the pending-scan index.
            conn.execute_batch(&format!(
                "CREATE UNIQUE INDEX idx_{table}_client_uuid ON {table}(client_uuid);
                 CREATE INDEX idx_{table}_pending ON {table}(id) WHERE synced = 0;"
            ))?;
        }
        Ok(())
    }

    // ---------- inserts ----------

    pub fn insert_activity_sample(&self, s: &ActivitySample) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO activity_sample
               (ts, app_name, window_title, pid, duration_s, client_uuid, synced, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7)",
            params![
                s.ts,
                s.app_name,
                s.window_title,
                s.pid,
                s.duration_s,
                new_uuid(),
                now_secs()
            ],
        )?;
        Ok(conn.last_insert_rowid())
    }

    /// Add `count` keypresses to the bucket starting at `ts_bucket`. Upsert keeps
    /// flushes idempotent and accumulative. No keys/characters are ever stored.
    ///
    /// A re-count is a mutation, so it resets `synced = 0` and bumps `updated_at` —
    /// an already-synced bucket re-syncs with its new total (see docs/11).
    pub fn add_keystrokes(&self, ts_bucket: i64, count: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO keystroke_bucket (ts_bucket, count, client_uuid, synced, updated_at)
             VALUES (?1, ?2, ?3, 0, ?4)
             ON CONFLICT(ts_bucket) DO UPDATE SET
                 count = count + excluded.count,
                 synced = 0,
                 updated_at = excluded.updated_at",
            params![ts_bucket, count, new_uuid(), now_secs()],
        )?;
        Ok(())
    }

    pub fn insert_screenshot(&self, s: &Screenshot) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO screenshot
               (ts, file_path, display_id, width, height, client_uuid, synced, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7)",
            params![
                s.ts,
                s.file_path,
                s.display_id,
                s.width,
                s.height,
                new_uuid(),
                now_secs()
            ],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn insert_browser_visit(&self, v: &BrowserVisit) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO browser_visit
               (ts, url, page_title, browser, duration_s, client_uuid, synced, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7)",
            params![
                v.ts,
                v.url,
                v.page_title,
                v.browser,
                v.duration_s,
                new_uuid(),
                now_secs()
            ],
        )?;
        Ok(conn.last_insert_rowid())
    }

    // ---------- queries (time-range; used by the UI in later tasks) ----------

    pub fn activity_between(&self, from_ts: i64, to_ts: i64) -> Result<Vec<ActivitySample>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT ts, app_name, window_title, pid, duration_s
             FROM activity_sample WHERE ts >= ?1 AND ts < ?2 ORDER BY ts",
        )?;
        let rows = stmt
            .query_map(params![from_ts, to_ts], |r| {
                Ok(ActivitySample {
                    ts: r.get(0)?,
                    app_name: r.get(1)?,
                    window_title: r.get(2)?,
                    pid: r.get(3)?,
                    duration_s: r.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;
        Ok(rows)
    }

    /// Keystroke buckets in `[from_ts, to_ts)` as `(ts_bucket, count)`.
    pub fn keystrokes_between(&self, from_ts: i64, to_ts: i64) -> Result<Vec<(i64, i64)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT ts_bucket, count FROM keystroke_bucket
             WHERE ts_bucket >= ?1 AND ts_bucket < ?2 ORDER BY ts_bucket",
        )?;
        let rows = stmt
            .query_map(params![from_ts, to_ts], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn screenshots_between(&self, from_ts: i64, to_ts: i64) -> Result<Vec<Screenshot>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT ts, file_path, display_id, width, height FROM screenshot
             WHERE ts >= ?1 AND ts < ?2 ORDER BY ts",
        )?;
        let rows = stmt
            .query_map(params![from_ts, to_ts], |r| {
                Ok(Screenshot {
                    ts: r.get(0)?,
                    file_path: r.get(1)?,
                    display_id: r.get(2)?,
                    width: r.get(3)?,
                    height: r.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;
        Ok(rows)
    }

    /// Delete screenshot rows older than `cutoff_ts`, returning their file paths so
    /// the caller can remove the files. Used by the retention job (task 29).
    pub fn delete_screenshots_before(&self, cutoff_ts: i64) -> Result<Vec<String>> {
        let conn = self.conn.lock().unwrap();
        let mut paths = Vec::new();
        {
            let mut stmt = conn.prepare("SELECT file_path FROM screenshot WHERE ts < ?1")?;
            let rows = stmt.query_map(params![cutoff_ts], |r| r.get::<_, String>(0))?;
            for p in rows {
                paths.push(p?);
            }
        }
        conn.execute("DELETE FROM screenshot WHERE ts < ?1", params![cutoff_ts])?;
        Ok(paths)
    }

    pub fn browser_visits_between(&self, from_ts: i64, to_ts: i64) -> Result<Vec<BrowserVisit>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT ts, url, page_title, browser, duration_s FROM browser_visit
             WHERE ts >= ?1 AND ts < ?2 ORDER BY ts",
        )?;
        let rows = stmt
            .query_map(params![from_ts, to_ts], |r| {
                Ok(BrowserVisit {
                    ts: r.get(0)?,
                    url: r.get(1)?,
                    page_title: r.get(2)?,
                    browser: r.get(3)?,
                    duration_s: r.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;
        Ok(rows)
    }

    // ---------- sync helpers (synced = 0 → backend; task 53) ----------

    /// Pending activity rows (oldest first, capped at `limit`) for a sync batch.
    pub fn pending_activity(&self, limit: i64) -> Result<Vec<PendingActivity>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT client_uuid, ts, app_name, window_title, pid, duration_s, updated_at
             FROM activity_sample WHERE synced = 0 ORDER BY id LIMIT ?1",
        )?;
        let rows = stmt
            .query_map(params![limit], |r| {
                Ok(PendingActivity {
                    client_uuid: r.get(0)?,
                    ts: r.get(1)?,
                    app_name: r.get(2)?,
                    window_title: r.get(3)?,
                    pid: r.get(4)?,
                    duration_s: r.get(5)?,
                    updated_at: r.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;
        Ok(rows)
    }

    /// Pending keystroke buckets (oldest first, capped at `limit`).
    pub fn pending_keystrokes(&self, limit: i64) -> Result<Vec<PendingKeystroke>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT client_uuid, ts_bucket, count, updated_at
             FROM keystroke_bucket WHERE synced = 0 ORDER BY id LIMIT ?1",
        )?;
        let rows = stmt
            .query_map(params![limit], |r| {
                Ok(PendingKeystroke {
                    client_uuid: r.get(0)?,
                    ts_bucket: r.get(1)?,
                    count: r.get(2)?,
                    updated_at: r.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;
        Ok(rows)
    }

    /// Pending browser visits (oldest first, capped at `limit`).
    pub fn pending_browser(&self, limit: i64) -> Result<Vec<PendingBrowser>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT client_uuid, ts, url, page_title, browser, duration_s, updated_at
             FROM browser_visit WHERE synced = 0 ORDER BY id LIMIT ?1",
        )?;
        let rows = stmt
            .query_map(params![limit], |r| {
                Ok(PendingBrowser {
                    client_uuid: r.get(0)?,
                    ts: r.get(1)?,
                    url: r.get(2)?,
                    page_title: r.get(3)?,
                    browser: r.get(4)?,
                    duration_s: r.get(5)?,
                    updated_at: r.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;
        Ok(rows)
    }

    /// Pending screenshots (oldest first, capped at `limit`). Uploaded one-by-one as
    /// multipart, so the worker can iterate this list.
    pub fn pending_screenshots(&self, limit: i64) -> Result<Vec<PendingScreenshot>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT client_uuid, ts, file_path, display_id, width, height, updated_at
             FROM screenshot WHERE synced = 0 ORDER BY id LIMIT ?1",
        )?;
        let rows = stmt
            .query_map(params![limit], |r| {
                Ok(PendingScreenshot {
                    client_uuid: r.get(0)?,
                    ts: r.get(1)?,
                    file_path: r.get(2)?,
                    display_id: r.get(3)?,
                    width: r.get(4)?,
                    height: r.get(5)?,
                    updated_at: r.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;
        Ok(rows)
    }

    /// Mark the given rows in `table` as synced (`synced = 1`) by `client_uuid`.
    /// Idempotent: re-marking an already-synced row is a harmless no-op.
    pub fn mark_synced(&self, table: SyncTable, client_uuids: &[String]) -> Result<()> {
        if client_uuids.is_empty() {
            return Ok(());
        }
        let conn = self.conn.lock().unwrap();
        let sql = format!(
            "UPDATE {} SET synced = 1 WHERE client_uuid = ?1",
            table.name()
        );
        let mut stmt = conn.prepare(&sql)?;
        for uuid in client_uuids {
            stmt.execute(params![uuid])?;
        }
        Ok(())
    }

    /// Total pending (unsynced) rows across all four tables — drives the sync
    /// status indicator (task 53).
    pub fn pending_count(&self) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        let mut total = 0i64;
        for t in [
            "activity_sample",
            "keystroke_bucket",
            "screenshot",
            "browser_visit",
        ] {
            let n: i64 = conn.query_row(
                &format!("SELECT COUNT(*) FROM {t} WHERE synced = 0"),
                [],
                |r| r.get(0),
            )?;
            total += n;
        }
        Ok(total)
    }
}

/// The four syncable tables — used by [`Db::mark_synced`] to pick the target.
#[derive(Debug, Clone, Copy)]
pub enum SyncTable {
    Activity,
    Keystroke,
    Browser,
    Screenshot,
}

impl SyncTable {
    fn name(self) -> &'static str {
        match self {
            SyncTable::Activity => "activity_sample",
            SyncTable::Keystroke => "keystroke_bucket",
            SyncTable::Browser => "browser_visit",
            SyncTable::Screenshot => "screenshot",
        }
    }
}

const MIGRATION_1: &str = r#"
CREATE TABLE activity_sample (
    id            INTEGER PRIMARY KEY,
    ts            INTEGER NOT NULL,
    app_name      TEXT    NOT NULL,
    window_title  TEXT,
    pid           INTEGER,
    duration_s    INTEGER NOT NULL
);
CREATE INDEX idx_activity_ts ON activity_sample(ts);

CREATE TABLE keystroke_bucket (
    id         INTEGER PRIMARY KEY,
    ts_bucket  INTEGER NOT NULL,
    count      INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_keystroke_bucket ON keystroke_bucket(ts_bucket);

CREATE TABLE screenshot (
    id          INTEGER PRIMARY KEY,
    ts          INTEGER NOT NULL,
    file_path   TEXT    NOT NULL,
    display_id  INTEGER,
    width       INTEGER,
    height      INTEGER
);
CREATE INDEX idx_screenshot_ts ON screenshot(ts);

CREATE TABLE browser_visit (
    id          INTEGER PRIMARY KEY,
    ts          INTEGER NOT NULL,
    url         TEXT    NOT NULL,
    page_title  TEXT,
    browser     TEXT,
    duration_s  INTEGER NOT NULL
);
CREATE INDEX idx_browser_visit_ts ON browser_visit(ts);
"#;

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Db {
        Db::open_in_memory().expect("open in-memory db")
    }

    #[test]
    fn migrations_set_version() {
        let db = db();
        let conn = db.conn.lock().unwrap();
        let v: i64 = conn
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .unwrap();
        assert_eq!(v, SCHEMA_VERSION);
    }

    #[test]
    fn activity_round_trip() {
        let db = db();
        db.insert_activity_sample(&ActivitySample {
            ts: 1000,
            app_name: "VS Code".into(),
            window_title: Some("lib.rs".into()),
            pid: Some(42),
            duration_s: 120,
        })
        .unwrap();
        let rows = db.activity_between(0, 2000).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].app_name, "VS Code");
        assert_eq!(rows[0].duration_s, 120);
    }

    #[test]
    fn keystroke_bucket_upserts() {
        let db = db();
        db.add_keystrokes(60, 10).unwrap();
        db.add_keystrokes(60, 5).unwrap();
        db.add_keystrokes(120, 3).unwrap();
        let rows = db.keystrokes_between(0, 1000).unwrap();
        assert_eq!(rows, vec![(60, 15), (120, 3)]);
    }

    #[test]
    fn screenshot_and_browser_round_trip() {
        let db = db();
        db.insert_screenshot(&Screenshot {
            ts: 500,
            file_path: "/tmp/a.png".into(),
            display_id: Some(1),
            width: Some(2560),
            height: Some(1440),
        })
        .unwrap();
        db.insert_browser_visit(&BrowserVisit {
            ts: 600,
            url: "https://github.com".into(),
            page_title: Some("GitHub".into()),
            browser: Some("chrome".into()),
            duration_s: 42,
        })
        .unwrap();
        assert_eq!(db.screenshots_between(0, 1000).unwrap().len(), 1);
        let visits = db.browser_visits_between(0, 1000).unwrap();
        assert_eq!(visits[0].url, "https://github.com");
    }

    #[test]
    fn delete_screenshots_before_prunes_and_returns_paths() {
        let db = db();
        for ts in [100, 200, 5000] {
            db.insert_screenshot(&Screenshot {
                ts,
                file_path: format!("/tmp/{ts}.png"),
                display_id: Some(0),
                width: Some(10),
                height: Some(10),
            })
            .unwrap();
        }
        // Cut off at 1000 — the two old shots go, the new one stays.
        let removed = db.delete_screenshots_before(1000).unwrap();
        assert_eq!(removed.len(), 2);
        assert!(removed.contains(&"/tmp/100.png".to_string()));
        assert_eq!(db.screenshots_between(0, 100000).unwrap().len(), 1);
    }

    // ---------- migration v2 / sync bookkeeping ----------

    #[test]
    fn migration_v2_backfills_uuids_without_data_loss() {
        // Build a v1 DB by hand, insert rows, then run the v2 migration over it.
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(MIGRATION_1).unwrap();
        conn.execute(
            "INSERT INTO activity_sample (ts, app_name, duration_s) VALUES (1, 'Old', 5)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO keystroke_bucket (ts_bucket, count) VALUES (60, 9)",
            [],
        )
        .unwrap();
        conn.pragma_update(None, "user_version", 1i64).unwrap();

        // from_conn re-runs migrate(), which now applies v2.
        let db = Db::from_conn(conn).unwrap();

        // Data survived and every old row got a non-empty uuid + synced = 0.
        let pend = db.pending_activity(100).unwrap();
        assert_eq!(pend.len(), 1);
        assert_eq!(pend[0].app_name, "Old");
        assert!(!pend[0].client_uuid.is_empty());

        let keys = db.pending_keystrokes(100).unwrap();
        assert_eq!(keys.len(), 1);
        assert_eq!(keys[0].count, 9);
        assert!(!keys[0].client_uuid.is_empty());

        // Two distinct uuids were backfilled.
        assert_ne!(pend[0].client_uuid, keys[0].client_uuid);
    }

    #[test]
    fn new_inserts_get_uuid_and_pending() {
        let db = db();
        db.insert_activity_sample(&ActivitySample {
            ts: 1,
            app_name: "Code".into(),
            window_title: None,
            pid: None,
            duration_s: 3,
        })
        .unwrap();
        let pend = db.pending_activity(100).unwrap();
        assert_eq!(pend.len(), 1);
        assert!(!pend[0].client_uuid.is_empty());
        assert!(pend[0].updated_at > 0);
        assert_eq!(db.pending_count().unwrap(), 1);
    }

    #[test]
    fn mark_synced_clears_pending() {
        let db = db();
        db.insert_browser_visit(&BrowserVisit {
            ts: 1,
            url: "https://x.com".into(),
            page_title: None,
            browser: None,
            duration_s: 1,
        })
        .unwrap();
        let pend = db.pending_browser(100).unwrap();
        assert_eq!(pend.len(), 1);
        db.mark_synced(SyncTable::Browser, &[pend[0].client_uuid.clone()])
            .unwrap();
        assert!(db.pending_browser(100).unwrap().is_empty());
        assert_eq!(db.pending_count().unwrap(), 0);
    }

    #[test]
    fn keystroke_increment_flips_synced_back_to_pending() {
        let db = db();
        db.add_keystrokes(60, 10).unwrap();
        let uuid = db.pending_keystrokes(100).unwrap()[0].client_uuid.clone();
        // Pretend the backend confirmed it.
        db.mark_synced(SyncTable::Keystroke, &[uuid]).unwrap();
        assert!(db.pending_keystrokes(100).unwrap().is_empty());

        // A re-count must flip it back to pending with the new total.
        db.add_keystrokes(60, 5).unwrap();
        let pend = db.pending_keystrokes(100).unwrap();
        assert_eq!(pend.len(), 1);
        assert_eq!(pend[0].count, 15);
    }

    #[test]
    fn time_range_filters() {
        let db = db();
        for ts in [10, 100, 1000] {
            db.insert_activity_sample(&ActivitySample {
                ts,
                app_name: "x".into(),
                window_title: None,
                pid: None,
                duration_s: 1,
            })
            .unwrap();
        }
        assert_eq!(db.activity_between(50, 500).unwrap().len(), 1);
    }
}
