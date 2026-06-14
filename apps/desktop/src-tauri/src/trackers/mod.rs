//! Background trackers (see docs/01-architecture.md).
//!
//! Currently: active-window + idle (task 7). Keyboard (17) and screenshots (19)
//! plug in later. Each tracker reads `TrackerControl` for live settings and writes
//! through `crate::storage`.
//!
//! The decision logic lives in `WindowTracker::tick`, a pure function over
//! (active?, window, threshold, now) → optional sample-to-flush, so it's unit
//! tested without real timers or platform calls.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::platform::ActiveWindowInfo;
use crate::storage::{ActivitySample, Db};

/// How often the active-window/idle loop polls.
const POLL: Duration = Duration::from_secs(1);
/// Seconds of active time each tick represents.
const TICK_S: i64 = 1;
/// Default idle threshold — no input for this long pauses time counting.
pub const DEFAULT_IDLE_THRESHOLD_S: u64 = 60;
/// Flush an ongoing interval at least this often so the dashboard stays fresh and
/// a crash can't lose more than this much active time.
const MAX_CHUNK_S: i64 = 60;

/// Live, shareable control surface for the trackers. The UI flips these (pause,
/// idle threshold) and the loop reads them each tick.
pub struct TrackerControl {
    pub paused: AtomicBool,
    pub idle_threshold_s: AtomicU64,
}

impl TrackerControl {
    pub fn new() -> Self {
        TrackerControl {
            paused: AtomicBool::new(false),
            idle_threshold_s: AtomicU64::new(DEFAULT_IDLE_THRESHOLD_S),
        }
    }
}

impl Default for TrackerControl {
    fn default() -> Self {
        Self::new()
    }
}

fn now_ts() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// In-progress active-window interval, accumulating ACTIVE seconds only.
#[derive(Clone)]
struct Interval {
    start_ts: i64,
    app_name: String,
    title: Option<String>,
    pid: Option<i64>,
    duration_s: i64,
}

impl Interval {
    fn sample(&self) -> ActivitySample {
        ActivitySample {
            ts: self.start_ts,
            app_name: self.app_name.clone(),
            window_title: self.title.clone(),
            pid: self.pid,
            duration_s: self.duration_s,
        }
    }
}

/// Pure decision core for active-window tracking. Holds the open interval; each
/// `tick` returns `Some(sample)` when an interval should be persisted.
#[derive(Default)]
pub struct WindowTracker {
    current: Option<Interval>,
}

impl WindowTracker {
    /// Advance one poll step.
    /// - `active`: is the user present (idle < threshold) and not paused?
    /// - `win`: the foreground window, if any.
    /// Returns a sample to flush, or `None`.
    fn tick(
        &mut self,
        active: bool,
        win: Option<ActiveWindowInfo>,
        threshold_s: i64,
        now: i64,
    ) -> Option<ActivitySample> {
        // Not active (idle / paused) or no foreground window → close any interval.
        if !active {
            return self.close_idle(threshold_s);
        }
        let win = match win {
            Some(w) => w,
            None => return self.close(),
        };

        match self.current {
            Some(ref mut iv) if iv.app_name == win.app_name && iv.title == win.title => {
                iv.duration_s += TICK_S;
                if iv.duration_s >= MAX_CHUNK_S {
                    // Persist the chunk, then keep counting the same window fresh.
                    let out = iv.sample();
                    iv.start_ts = now;
                    iv.duration_s = 0;
                    Some(out)
                } else {
                    None
                }
            }
            _ => {
                let flushed = self.current.take().map(|iv| iv.sample());
                self.current = Some(Interval {
                    start_ts: now,
                    app_name: win.app_name,
                    title: win.title,
                    pid: Some(win.pid),
                    duration_s: TICK_S,
                });
                flushed
            }
        }
    }

    /// Close the interval because we went idle: drop the grace window we counted
    /// before detecting idle (retroactive trim), then emit it.
    fn close_idle(&mut self, threshold_s: i64) -> Option<ActivitySample> {
        self.current.take().and_then(|mut iv| {
            iv.duration_s = (iv.duration_s - threshold_s).max(0);
            if iv.duration_s > 0 {
                Some(iv.sample())
            } else {
                None
            }
        })
    }

    /// Close the interval as-is (e.g. no foreground window).
    fn close(&mut self) -> Option<ActivitySample> {
        self.current
            .take()
            .filter(|iv| iv.duration_s > 0)
            .map(|iv| iv.sample())
    }
}

/// Spawn the active-window + idle tracker on a background thread.
pub fn start(db: Arc<Db>, control: Arc<TrackerControl>) {
    thread::spawn(move || run(db, control));
}

fn run(db: Arc<Db>, control: Arc<TrackerControl>) {
    let mut tracker = WindowTracker::default();

    loop {
        thread::sleep(POLL);

        let threshold = control.idle_threshold_s.load(Ordering::Relaxed) as i64;
        let paused = control.paused.load(Ordering::Relaxed);
        // Idle covers screen-locked / display-asleep too: no input → idle grows.
        let idle = crate::platform::idle_seconds();
        let active = !paused && idle < threshold as f64;

        let win = if active {
            crate::platform::active_window()
        } else {
            None
        };

        if let Some(sample) = tracker.tick(active, win, threshold, now_ts()) {
            if sample.duration_s > 0 {
                if let Err(e) = db.insert_activity_sample(&sample) {
                    eprintln!("[tracker] failed to write activity_sample: {e}");
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn win(app: &str, title: &str) -> ActiveWindowInfo {
        ActiveWindowInfo {
            app_name: app.to_string(),
            title: Some(title.to_string()),
            pid: 1,
        }
    }

    #[test]
    fn accumulates_then_flushes_on_window_change() {
        let mut t = WindowTracker::default();
        // Same window for 3 ticks → no flush yet.
        assert!(t.tick(true, Some(win("Code", "a")), 60, 100).is_none());
        assert!(t.tick(true, Some(win("Code", "a")), 60, 101).is_none());
        assert!(t.tick(true, Some(win("Code", "a")), 60, 102).is_none());
        // Switch window → previous interval flushes with 3s.
        let flushed = t.tick(true, Some(win("Chrome", "b")), 60, 103).unwrap();
        assert_eq!(flushed.app_name, "Code");
        assert_eq!(flushed.duration_s, 3);
        assert_eq!(flushed.ts, 100);
    }

    #[test]
    fn idle_trims_grace_window() {
        let mut t = WindowTracker::default();
        let threshold = 5;
        // 8 active ticks on one window.
        for i in 0..8 {
            assert!(t.tick(true, Some(win("Code", "a")), threshold, 100 + i).is_none());
        }
        // Go idle → trim `threshold` seconds of grace from the 8 counted.
        let flushed = t.tick(false, None, threshold, 108).unwrap();
        assert_eq!(flushed.duration_s, 8 - threshold);
    }

    #[test]
    fn short_interval_fully_idle_writes_nothing() {
        let mut t = WindowTracker::default();
        let threshold = 60;
        // Only 2s of activity, then idle: 2 - 60 clamps to 0 → no row.
        t.tick(true, Some(win("Code", "a")), threshold, 100);
        t.tick(true, Some(win("Code", "a")), threshold, 101);
        assert!(t.tick(false, None, threshold, 102).is_none());
    }

    #[test]
    fn long_interval_chunks_at_max() {
        let mut t = WindowTracker::default();
        let mut flushes = 0;
        // Run one window for MAX_CHUNK_S + a bit; expect a chunk flush at the cap.
        for i in 0..(MAX_CHUNK_S + 3) {
            if t.tick(true, Some(win("Code", "a")), 600, 100 + i).is_some() {
                flushes += 1;
            }
        }
        assert_eq!(flushes, 1, "should flush exactly one chunk at the cap");
    }

    #[test]
    fn no_foreground_window_closes_interval() {
        let mut t = WindowTracker::default();
        t.tick(true, Some(win("Code", "a")), 60, 100);
        t.tick(true, Some(win("Code", "a")), 60, 101);
        // Active but no foreground window → flush what we had.
        let flushed = t.tick(true, None, 60, 102).unwrap();
        assert_eq!(flushed.app_name, "Code");
        assert_eq!(flushed.duration_s, 2);
    }
}
