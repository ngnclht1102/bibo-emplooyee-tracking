//! Lightweight product analytics — posts an `app_started` event straight to Aptabase's
//! ingest API. We do NOT use `tauri-plugin-aptabase`: that plugin calls a raw
//! `tokio::spawn` in its setup, which panics ("no reactor running") and aborts release
//! builds. Here we fire-and-forget over our existing rustls `reqwest`, dispatched on
//! Tauri's own async runtime — no extra TLS stack, no crash.
//!
//! Region is encoded in the key prefix (`A-EU-…` → the EU ingest host).

use serde_json::json;
use uuid::Uuid;

const APP_KEY: &str = "A-EU-4411171274";
const INGEST_URL: &str = "https://eu.aptabase.com/api/v0/event";

fn os_name() -> &'static str {
    match std::env::consts::OS {
        "macos" => "macOS",
        "windows" => "Windows",
        "linux" => "Linux",
        other => other,
    }
}

/// Send one `app_started` event (DAU / version-adoption / OS breakdown). Best-effort:
/// failures are logged, never propagated. `isDebug` tags dev runs so the dashboard can
/// filter them out.
pub fn track_app_started(locale: String) {
    tauri::async_runtime::spawn(async move {
        let os_version = os_info::get().version().to_string();
        let now = time::OffsetDateTime::now_utc()
            .format(&time::format_description::well_known::Rfc3339)
            .unwrap_or_default();

        let body = json!({
            "timestamp": now,
            "sessionId": Uuid::new_v4().to_string(),
            "eventName": "app_started",
            "systemProps": {
                "isDebug": cfg!(debug_assertions),
                "locale": locale,
                "osName": os_name(),
                "osVersion": os_version,
                "appVersion": env!("CARGO_PKG_VERSION"),
                "sdkVersion": "ctracking-rust@1.0.0",
            },
        });

        let client = match reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
        {
            Ok(c) => c,
            Err(e) => {
                crate::log_warn!("analytics", "client build failed: {e}");
                return;
            }
        };
        match client
            .post(INGEST_URL)
            .header("App-Key", APP_KEY)
            .json(&body)
            .send()
            .await
        {
            Ok(resp) => crate::log_info!("analytics", "app_started -> {}", resp.status()),
            Err(e) => crate::log_warn!("analytics", "app_started failed: {e}"),
        }
    });
}
