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

use std::path::Path;

use crate::platform::ActiveWindowInfo;
use crate::storage::{ActivitySample, Db, Screenshot};

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
    pub screenshot_interval_s: AtomicU64,
    pub screenshot_retention_days: AtomicU64,
    /// Store only the site origin (scheme://host) for browser visits, not full URLs.
    pub domain_only: AtomicBool,
}

impl TrackerControl {
    pub fn new() -> Self {
        TrackerControl {
            paused: AtomicBool::new(false),
            idle_threshold_s: AtomicU64::new(DEFAULT_IDLE_THRESHOLD_S),
            screenshot_interval_s: AtomicU64::new(DEFAULT_SCREENSHOT_INTERVAL_S),
            screenshot_retention_days: AtomicU64::new(DEFAULT_RETENTION_DAYS),
            domain_only: AtomicBool::new(false),
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

// ---------- keyboard counter (task 17) ----------

/// Keypress counts are flushed at this cadence.
const KEY_FLUSH: Duration = Duration::from_secs(15);
/// Counts are bucketed by this window (start-of-bucket epoch is the key).
const KEY_BUCKET_S: i64 = 60;

/// Default seconds between periodic screenshots.
pub const DEFAULT_SCREENSHOT_INTERVAL_S: u64 = 300;

/// Default days to keep screenshots before cleanup.
pub const DEFAULT_RETENTION_DAYS: u64 = 30;

/// Spawn the keyboard counter: a minimal CoreGraphics tap that only *counts* key
/// presses (the key is never decoded or stored — see `platform::run_keyboard_tap`),
/// plus a flusher that writes per-minute counts. Pause-aware.
pub fn start_keyboard(db: Arc<Db>, control: Arc<TrackerControl>) {
    // Flusher: move the tap's running count into the current bucket.
    {
        thread::spawn(move || loop {
            thread::sleep(KEY_FLUSH);
            let n = crate::platform::KEY_PRESS_COUNT.swap(0, Ordering::Relaxed);
            // Drop counts accumulated while paused (don't persist them).
            if n > 0 && !control.paused.load(Ordering::Relaxed) {
                let now = now_ts();
                let bucket = now - now.rem_euclid(KEY_BUCKET_S);
                if let Err(e) = db.add_keystrokes(bucket, n as i64) {
                    eprintln!("[keyboard] failed to write keystroke_bucket: {e}");
                }
            }
        });
    }

    // Tap: blocks while active; returns if it can't be created (permission not yet
    // granted) — retry so it starts as soon as the user grants Input Monitoring.
    thread::spawn(|| loop {
        crate::platform::run_keyboard_tap();
        thread::sleep(Duration::from_secs(3));
    });
}

// ---------- screenshots (task 19) ----------

/// Hard ceiling on a stored/uploaded screenshot. The backend enforces its own
/// (larger) guard; we keep every shot comfortably under this. See docs/11.
const SCREENSHOT_MAX_BYTES: usize = 50 * 1024;

/// Candidate long-edge sizes (px) and WebP qualities, tried in order. We step
/// quality down first, then resolution, until a shot fits SCREENSHOT_MAX_BYTES.
const SHOT_MAX_DIMS: [u32; 3] = [1366, 1152, 960];
const SHOT_QUALITIES: [f32; 5] = [55.0, 45.0, 35.0, 25.0, 20.0];

/// Downscale to a max long-edge and encode lossy WebP, returning the smallest
/// result that fits SCREENSHOT_MAX_BYTES. If even the floor (smallest dims +
/// lowest quality) exceeds the cap, the smallest encoding produced is returned.
/// Returns the encoded bytes plus the final (width, height).
fn compress_to_webp(img: &xcap::image::RgbaImage) -> (Vec<u8>, u32, u32) {
    use xcap::image::imageops::{self, FilterType};

    let mut smallest: Option<(Vec<u8>, u32, u32)> = None;
    for &max_dim in &SHOT_MAX_DIMS {
        let (ow, oh) = (img.width(), img.height());
        let long_edge = ow.max(oh);
        let resized;
        let (w, h) = if long_edge > max_dim {
            let scale = max_dim as f32 / long_edge as f32;
            let nw = (ow as f32 * scale).round().max(1.0) as u32;
            let nh = (oh as f32 * scale).round().max(1.0) as u32;
            resized = imageops::resize(img, nw, nh, FilterType::Triangle);
            (nw, nh)
        } else {
            // Already small enough; encode the original buffer at each quality.
            resized = img.clone();
            (ow, oh)
        };

        for &q in &SHOT_QUALITIES {
            let encoded = webp::Encoder::from_rgba(resized.as_raw(), w, h).encode(q);
            let bytes = encoded.to_vec();
            if bytes.len() <= SCREENSHOT_MAX_BYTES {
                return (bytes, w, h);
            }
            if smallest.as_ref().map_or(true, |(b, ..)| bytes.len() < b.len()) {
                smallest = Some((bytes, w, h));
            }
        }
    }
    // Nothing fit the cap (extremely detailed screen) — keep the smallest.
    smallest.expect("at least one encoding attempt")
}

/// Capture every display, compress to ≤50 KB WebP under `dir`, and record each in
/// the DB. Returns how many shots were saved. Requires Screen Recording.
pub fn capture_once(db: &Db, dir: &Path) -> usize {
    if let Err(e) = std::fs::create_dir_all(dir) {
        eprintln!("[screenshot] create dir failed: {e}");
        return 0;
    }
    let monitors = match xcap::Monitor::all() {
        Ok(m) => m,
        Err(e) => {
            eprintln!("[screenshot] enumerate monitors failed: {e}");
            return 0;
        }
    };

    let now = now_ts();
    let mut saved = 0;
    for (i, monitor) in monitors.into_iter().enumerate() {
        let img = match monitor.capture_image() {
            Ok(img) => img,
            Err(e) => {
                eprintln!("[screenshot] capture failed: {e}");
                continue;
            }
        };
        // Compress to a small WebP; store the *encoded* dimensions so width/height
        // match the bytes on disk (and what the backend records).
        let (bytes, w, h) = compress_to_webp(&img);
        let path = dir.join(format!("{now}_display{i}.webp"));
        if let Err(e) = std::fs::write(&path, &bytes) {
            eprintln!("[screenshot] save failed: {e}");
            continue;
        }
        let shot = Screenshot {
            ts: now,
            file_path: path.to_string_lossy().into_owned(),
            display_id: Some(i as i64),
            width: Some(w as i64),
            height: Some(h as i64),
        };
        if let Err(e) = db.insert_screenshot(&shot) {
            eprintln!("[screenshot] db insert failed: {e}");
            continue;
        }
        saved += 1;
    }
    saved
}

/// Spawn the screenshot retention job (task 29): periodically delete screenshots
/// older than the configured age cap, removing both files and DB rows.
pub fn start_cleanup(db: Arc<Db>, control: Arc<TrackerControl>) {
    thread::spawn(move || loop {
        let days = control.screenshot_retention_days.load(Ordering::Relaxed).max(1);
        let cutoff = now_ts() - (days as i64) * 86_400;
        match db.delete_screenshots_before(cutoff) {
            Ok(paths) => {
                for p in paths {
                    let _ = std::fs::remove_file(&p);
                }
            }
            Err(e) => eprintln!("[cleanup] screenshot prune failed: {e}"),
        }
        // Run hourly (and once shortly after startup via the first sleep being short).
        thread::sleep(Duration::from_secs(3600));
    });
}

/// Spawn the periodic screenshot taker. Permission-gated and pause-aware.
pub fn start_screenshots(db: Arc<Db>, control: Arc<TrackerControl>, dir: std::path::PathBuf) {
    use crate::platform::{permission_status, Permission, PermissionState};
    thread::spawn(move || loop {
        let interval = control.screenshot_interval_s.load(Ordering::Relaxed).max(5);
        thread::sleep(Duration::from_secs(interval));
        if control.paused.load(Ordering::Relaxed) {
            continue;
        }
        if permission_status(Permission::ScreenRecording) != PermissionState::Granted {
            continue;
        }
        capture_once(&db, &dir);
    });
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

    /// Build a synthetic "screen": a smooth gradient (compresses well) plus a
    /// noisy strip (hard to compress), at a large 2560x1440 so resolution must
    /// be reduced. Exercises the full quality+resolution fallback.
    fn synthetic_screen() -> xcap::image::RgbaImage {
        let (w, h) = (2560u32, 1440u32);
        xcap::image::RgbaImage::from_fn(w, h, |x, y| {
            let noisy = y < h / 4; // top quarter is high-frequency noise
            let n = if noisy {
                ((x.wrapping_mul(2654435761).wrapping_add(y.wrapping_mul(40503))) & 0xFF) as u8
            } else {
                0
            };
            xcap::image::Rgba([
                ((x * 255 / w) as u8).wrapping_add(n),
                ((y * 255 / h) as u8).wrapping_add(n),
                128u8.wrapping_add(n),
                255,
            ])
        })
    }

    #[test]
    fn screenshot_compresses_under_cap() {
        let img = synthetic_screen();
        let (bytes, w, h) = compress_to_webp(&img);
        assert!(
            bytes.len() <= SCREENSHOT_MAX_BYTES,
            "compressed size {} exceeds cap {}",
            bytes.len(),
            SCREENSHOT_MAX_BYTES
        );
        // It's a valid WebP (RIFF....WEBP container).
        assert_eq!(&bytes[0..4], b"RIFF");
        assert_eq!(&bytes[8..12], b"WEBP");
        // Large source → downscaled to one of the candidate long edges.
        assert!(w.max(h) <= SHOT_MAX_DIMS[0], "not downscaled: {w}x{h}");
        assert!(w > 0 && h > 0);
    }

    #[test]
    fn small_screen_not_upscaled() {
        // A source already under the smallest candidate keeps its dimensions.
        let img = xcap::image::RgbaImage::from_pixel(800, 600, xcap::image::Rgba([20, 60, 90, 255]));
        let (bytes, w, h) = compress_to_webp(&img);
        assert!(bytes.len() <= SCREENSHOT_MAX_BYTES);
        assert_eq!((w, h), (800, 600));
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
