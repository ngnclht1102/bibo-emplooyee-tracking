//! Lightweight product analytics — posts an `app_started` event straight to Aptabase's
//! ingest API. We do NOT use `tauri-plugin-aptabase`: that plugin calls a raw
//! `tokio::spawn` in its setup, which panics ("no reactor running") and aborts release
//! builds. Here we fire-and-forget over our existing rustls `reqwest`, dispatched on
//! Tauri's own async runtime — no extra TLS stack, no crash.
//!
//! Region is encoded in the key prefix (`A-EU-…` → the EU ingest host).
//!
//! Identity: `sessionId` is derived from the stable per-install `device_id` bucketed by
//! UTC day (`<device_id>-<epoch_day>`), so each device yields exactly one session per day.
//! Aptabase's daily metrics then reflect unique *devices* (true DAU / version adoption),
//! not raw launch count, which a per-launch random id would inflate.
//!
//! Offline-resilient: launches with no network persist the event to a small on-disk queue
//! and flush it (batched) on a later launch, so opens aren't silently lost.

use serde_json::{json, Value};
use std::path::{Path, PathBuf};

const APP_KEY: &str = "A-EU-4411171274";
/// Plural batch endpoint — accepts a JSON array of events in one request.
const INGEST_URL: &str = "https://eu.aptabase.com/api/v0/events";
/// Cap on queued (un-sent) events so a permanently-offline device can't grow the queue
/// without bound. Oldest are dropped first; drops are logged (never silent).
const QUEUE_CAP: usize = 50;

fn os_name() -> &'static str {
    match std::env::consts::OS {
        "macos" => "macOS",
        "windows" => "Windows",
        "linux" => "Linux",
        other => other,
    }
}

/// Build one event. `device_id` gives a stable per-device session (bucketed by UTC day);
/// `isDebug` tags dev runs so the dashboard can filter them out. Optional `props` carry
/// event-specific fields (e.g. the clicked label) under Aptabase's `props` object.
fn build_event(event_name: &str, locale: &str, device_id: &str, props: Option<Value>) -> Value {
    let now = time::OffsetDateTime::now_utc();
    let timestamp = now
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_default();
    let epoch_day = now.unix_timestamp() / 86_400;

    let mut event = json!({
        "timestamp": timestamp,
        "sessionId": format!("{device_id}-{epoch_day}"),
        "eventName": event_name,
        "systemProps": {
            "isDebug": cfg!(debug_assertions),
            "locale": locale,
            "osName": os_name(),
            "osVersion": os_info::get().version().to_string(),
            "appVersion": env!("CARGO_PKG_VERSION"),
            "sdkVersion": "ctracking-rust@1.0.0",
        },
    });
    if let Some(p) = props {
        event["props"] = p;
    }
    event
}

/// Read any events parked by earlier offline launches. Returns each event paired with the
/// file it came from so we can delete exactly those on a successful flush.
fn read_queue(dir: &Path) -> Vec<(PathBuf, Value)> {
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return out; // dir absent on first run — nothing queued
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        match std::fs::read(&path)
            .ok()
            .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
        {
            Some(ev) => out.push((path, ev)),
            None => {
                // Corrupt/partial file — drop it so it can't wedge the queue forever.
                let _ = std::fs::remove_file(&path);
            }
        }
    }
    out
}

/// Persist `event` to the on-disk queue for a later flush. Enforces `QUEUE_CAP` by dropping
/// the oldest queued events first (and logging the drop).
fn enqueue(dir: &Path, event: &Value) {
    if std::fs::create_dir_all(dir).is_err() {
        crate::log_warn!("analytics", "queue dir create failed; event dropped");
        return;
    }
    let mut queued: Vec<PathBuf> = std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("json"))
        .collect();
    queued.sort();
    while queued.len() >= QUEUE_CAP {
        let oldest = queued.remove(0);
        let _ = std::fs::remove_file(&oldest);
        crate::log_warn!("analytics", "queue full ({QUEUE_CAP}); dropped oldest event");
    }
    let name = format!("{}.json", uuid::Uuid::new_v4());
    match serde_json::to_vec(event) {
        Ok(bytes) => {
            if std::fs::write(dir.join(name), bytes).is_err() {
                crate::log_warn!("analytics", "queue write failed; event dropped");
            }
        }
        Err(e) => crate::log_warn!("analytics", "event serialize failed: {e}"),
    }
}

/// One `app_started` event (DAU / version-adoption / OS breakdown).
pub fn track_app_started(locale: String, device_id: String, queue_dir: PathBuf) {
    track_event("app_started".into(), locale, device_id, queue_dir, None);
}

/// Send one event, flushing any events queued by earlier offline runs in the same batch.
/// Best-effort: failures are logged and the current event is re-queued, never propagated.
/// Used for `app_started` (launch) and UI events (`app_active`, `ui_click`) from the web UI.
pub fn track_event(
    event_name: String,
    locale: String,
    device_id: String,
    queue_dir: PathBuf,
    props: Option<Value>,
) {
    tauri::async_runtime::spawn(async move {
        let event = build_event(&event_name, &locale, &device_id, props);
        let queued = read_queue(&queue_dir);

        let mut batch: Vec<Value> = queued.iter().map(|(_, ev)| ev.clone()).collect();
        batch.push(event.clone());

        let client = match reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
        {
            Ok(c) => c,
            Err(e) => {
                crate::log_warn!("analytics", "client build failed: {e}");
                enqueue(&queue_dir, &event);
                return;
            }
        };

        match client
            .post(INGEST_URL)
            .header("App-Key", APP_KEY)
            .json(&batch)
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {
                crate::log_info!(
                    "analytics",
                    "flushed {} event(s) [{event_name}] -> {}",
                    batch.len(),
                    resp.status()
                );
                // Sent for good — drop the parked copies.
                for (path, _) in &queued {
                    let _ = std::fs::remove_file(path);
                }
            }
            Ok(resp) => {
                crate::log_warn!("analytics", "{event_name} -> {} (re-queued)", resp.status());
                enqueue(&queue_dir, &event);
            }
            Err(e) => {
                crate::log_warn!("analytics", "{event_name} failed: {e} (re-queued)");
                enqueue(&queue_dir, &event);
            }
        }
    });
}
