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

use rusqlite::{params, Connection};
use serde::Serialize;

/// Latest schema version. Bump when adding a migration below.
const SCHEMA_VERSION: i64 = 1;

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

        conn.pragma_update(None, "user_version", version)?;
        debug_assert_eq!(version, SCHEMA_VERSION);
        Ok(())
    }

    // ---------- inserts ----------

    pub fn insert_activity_sample(&self, s: &ActivitySample) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO activity_sample (ts, app_name, window_title, pid, duration_s)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![s.ts, s.app_name, s.window_title, s.pid, s.duration_s],
        )?;
        Ok(conn.last_insert_rowid())
    }

    /// Add `count` keypresses to the bucket starting at `ts_bucket`. Upsert keeps
    /// flushes idempotent and accumulative. No keys/characters are ever stored.
    pub fn add_keystrokes(&self, ts_bucket: i64, count: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO keystroke_bucket (ts_bucket, count) VALUES (?1, ?2)
             ON CONFLICT(ts_bucket) DO UPDATE SET count = count + excluded.count",
            params![ts_bucket, count],
        )?;
        Ok(())
    }

    pub fn insert_screenshot(&self, s: &Screenshot) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO screenshot (ts, file_path, display_id, width, height)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![s.ts, s.file_path, s.display_id, s.width, s.height],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn insert_browser_visit(&self, v: &BrowserVisit) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO browser_visit (ts, url, page_title, browser, duration_s)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![v.ts, v.url, v.page_title, v.browser, v.duration_s],
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
