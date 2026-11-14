//! Headless auto-update (CTR-48).
//!
//! The web UI has always driven updates (launch + every window focus, 5-min
//! throttle, download then *ask* before restarting). That never fires for a machine
//! that leaves the app in the menu bar without opening the window, so those stayed
//! on an old build forever.
//!
//! This module adds a second, UI-independent checker that only runs while the app is
//! in the background: every 6 h (plus a per-machine jitter so machines started at the
//! same time don't call in a clump), download silently, then relaunch *when it is
//! safe* — window closed, machine idle a few minutes, local DB checkpointed to disk.
//! With no window there is nobody to ask, so the safety conditions replace the prompt.
//!
//! 6 h rather than hourly on purpose: we ship every few weeks, so the extra delay
//! costs users nothing and buys us a window to pull a bad build from the manifest
//! before most machines take it — which matters a lot more now that the update
//! restarts the app by itself.
//!
//! Both sides share one "last checked" mark ([`UpdateGate`]) so closing/reopening the
//! window can never produce two checks back to back, and each version gets at most
//! one automatic restart (marker file) so a build that cannot start can't loop.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_updater::UpdaterExt;

use crate::storage::Db;

/// Background check cadence.
const CHECK_EVERY_S: i64 = 6 * 60 * 60;
/// Upper bound of the per-machine random offset added to the cadence.
const JITTER_MAX_S: i64 = 40 * 60;
/// How long after launch the background checker may step in when the UI never
/// checked (e.g. a hidden login launch where the webview check failed).
const STARTUP_GRACE_S: i64 = 10 * 60;
/// Poll step for both the "is it time" and the "is it safe to restart" waits.
const TICK: Duration = Duration::from_secs(60);
/// No user input for this long = safe to restart (don't cut into a meeting).
const IDLE_BEFORE_RESTART_S: f64 = 5.0 * 60.0;
/// Give up waiting for a safe moment after this long and try again next cycle.
const SAFE_WAIT_MAX_S: i64 = 12 * 60 * 60;

/// Written right before a silent `install()`, read on the next launch: it both tells
/// the new build to start hidden + show the "you were updated" notice, and keeps us
/// from auto-restarting into the same version twice if it fails to come up.
const MARKER: &str = "silent-update.json";

#[derive(Serialize, Deserialize)]
struct Marker {
    version: String,
    attempted_at: i64,
}

/// The one check timestamp shared by the UI and the background checker, plus the
/// "we updated you while you weren't looking" notice for the UI to show once.
#[derive(Default)]
pub struct UpdateGate {
    last_check_unix: AtomicI64,
    notice: Mutex<Option<String>>,
}

impl UpdateGate {
    /// Claim the right to hit the manifest: true (and the mark moves to now) only if
    /// the last check — by either side — is at least `min_gap_s` old.
    pub fn claim(&self, min_gap_s: i64) -> bool {
        let now = crate::now_unix();
        loop {
            let last = self.last_check_unix.load(Ordering::Relaxed);
            if now - last < min_gap_s {
                return false;
            }
            if self
                .last_check_unix
                .compare_exchange(last, now, Ordering::Relaxed, Ordering::Relaxed)
                .is_ok()
            {
                return true;
            }
        }
    }

    fn last_check(&self) -> i64 {
        self.last_check_unix.load(Ordering::Relaxed)
    }

    fn set_last_check(&self, ts: i64) {
        self.last_check_unix.store(ts, Ordering::Relaxed);
    }

    /// Read and clear the pending "updated to X" notice.
    pub fn take_notice(&self) -> Option<String> {
        self.notice.lock().unwrap().take()
    }

    pub fn set_notice(&self, version: String) {
        *self.notice.lock().unwrap() = Some(version);
    }
}

/// What the last silent install (if any) left behind.
pub struct Startup {
    /// A silent update landed: start hidden, and tell the user once.
    pub updated_to: Option<String>,
    /// A version we restarted into but are NOT running — never auto-restart into it
    /// again (it may be a build that can't start).
    pub blocked: Option<String>,
}

/// Inspect + clean the marker file. Call once during setup, before the window shows.
pub fn startup(data_dir: &Path, current_version: &str) -> Startup {
    let path = data_dir.join(MARKER);
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return Startup { updated_to: None, blocked: None };
    };
    let Ok(m) = serde_json::from_str::<Marker>(&raw) else {
        let _ = std::fs::remove_file(&path);
        return Startup { updated_to: None, blocked: None };
    };
    if m.version == current_version {
        let _ = std::fs::remove_file(&path);
        crate::log_info!("update", "silent update landed: now on {}", current_version);
        Startup { updated_to: Some(m.version), blocked: None }
    } else {
        // We installed it and are running something else — treat it as suspect and
        // leave the marker in place so this never becomes a restart loop.
        crate::log_warn!(
            "update",
            "silent update to {} did not take (running {}); auto-restart disabled for it",
            m.version,
            current_version
        );
        Startup { updated_to: None, blocked: Some(m.version) }
    }
}

/// True while the main window is on screen — then updates are the UI's business.
fn window_open(app: &AppHandle) -> bool {
    app.get_webview_window("main")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false)
}

/// Per-machine, per-run offset so machines that all boot at 9:00 don't call together.
fn jitter() -> i64 {
    let mut b = [0u8; 2];
    if getrandom::getrandom(&mut b).is_err() {
        return 0;
    }
    (u16::from_le_bytes(b) as i64) % (JITTER_MAX_S + 1)
}

/// Start the background checker. Returns immediately; the work runs on its own
/// thread with a small tokio runtime (mirrors `sync::worker::start`).
pub fn start(
    app: AppHandle,
    db: Arc<Db>,
    gate: Arc<UpdateGate>,
    data_dir: PathBuf,
    blocked: Option<String>,
) {
    // Pretend we checked `CHECK_EVERY - grace` ago: the UI's launch check normally
    // moves the mark within seconds, and if it never does we step in after the grace.
    gate.set_last_check(crate::now_unix() - CHECK_EVERY_S + STARTUP_GRACE_S);

    std::thread::spawn(move || {
        let rt = match tokio::runtime::Builder::new_current_thread().enable_all().build() {
            Ok(rt) => rt,
            Err(e) => {
                crate::log_warn!("update", "runtime build failed: {e}");
                return;
            }
        };
        rt.block_on(async move {
            let mut offset = jitter();
            loop {
                tokio::time::sleep(TICK).await;
                // Window up → the UI's own check/prompt owns this.
                if window_open(&app) {
                    continue;
                }
                if crate::now_unix() < gate.last_check() + CHECK_EVERY_S + offset {
                    continue;
                }
                if !gate.claim(CHECK_EVERY_S) {
                    continue;
                }
                offset = jitter();
                if let Err(e) = cycle(&app, &db, &data_dir, blocked.as_deref()).await {
                    crate::log_warn!("update", "background update failed: {e}");
                }
            }
        });
    });
}

/// One background pass: check, download, wait for a safe moment, install + restart.
async fn cycle(
    app: &AppHandle,
    db: &Arc<Db>,
    data_dir: &Path,
    blocked: Option<&str>,
) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
        return Ok(());
    };
    let version = update.version.clone();
    if blocked == Some(version.as_str()) {
        crate::log_warn!("update", "skipping {version}: an earlier silent restart into it failed");
        return Ok(());
    }
    crate::log_info!("update", "background: {version} available, downloading");
    // Download only. `install()` is deliberately separate (ticket 136): on Windows it
    // runs the quiet NSIS installer, which kills the app the moment it is called — so
    // it must not happen until we've decided this is a safe moment and flushed to disk.
    let bytes = update
        .download(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    crate::log_info!("update", "background: {version} downloaded, waiting for a safe restart");

    let deadline = crate::now_unix() + SAFE_WAIT_MAX_S;
    loop {
        tokio::time::sleep(TICK).await;
        if window_open(app) {
            // The user came back: hand over to the UI, which will find the same update
            // on its next check and ask before restarting.
            crate::log_info!("update", "window reopened; leaving {version} to the UI prompt");
            return Ok(());
        }
        if crate::now_unix() > deadline {
            crate::log_info!("update", "no safe moment for {version} today; will retry");
            return Ok(());
        }
        if crate::platform::idle_seconds() < IDLE_BEFORE_RESTART_S {
            continue;
        }
        // Safe: nothing on screen, nobody at the keyboard. Get local data on disk
        // (WAL checkpoint) before an installer that can kill us without warning.
        db.checkpoint();
        let marker = Marker { version: version.clone(), attempted_at: crate::now_unix() };
        if let Ok(json) = serde_json::to_string(&marker) {
            if let Err(e) = std::fs::write(data_dir.join(MARKER), json) {
                crate::log_warn!("update", "could not write update marker: {e}");
            }
        }
        crate::log_info!("update", "installing {version} and restarting in the background");
        update.install(bytes).map_err(|e| e.to_string())?;
        // macOS: install() only unpacked the new bundle, so restart ourselves.
        // Windows: the quiet installer already took the process down.
        app.restart();
    }
}
