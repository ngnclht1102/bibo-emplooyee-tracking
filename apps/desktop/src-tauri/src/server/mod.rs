//! Local ingest server for the browser extension (see docs/04-browser-extension.md).
//!
//! A tiny axum server bound to 127.0.0.1 only. It binds the first free port from a
//! fixed candidate list (auto-fallback), so the extension can discover it by probing
//! the same list. `/whoami` is the discovery + token handoff; `/ingest` is the
//! token-protected endpoint that records browser visits.

use std::sync::Arc;
use std::thread;

use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};

use std::sync::atomic::Ordering;

use crate::storage::{BrowserVisit, Db};
use crate::trackers::TrackerControl;

/// Shared, fixed candidate ports (must match the extension). High registered range,
/// away from common dev/app/macOS ports, spread out.
pub const CANDIDATE_PORTS: [u16; 6] = [47615, 48291, 49377, 50603, 51719, 52837];

/// Header the extension sends with the shared token.
const TOKEN_HEADER: &str = "x-ctracking-token";

/// What the server bound to. Managed in Tauri state for the UI/commands.
pub struct BrowserLink {
    pub port: Option<u16>,
    pub token: String,
}

#[derive(Clone)]
struct AppState {
    db: Arc<Db>,
    token: Arc<String>,
    control: Arc<TrackerControl>,
}

/// Reduce a URL to its origin (`scheme://host`) for the domain-only privacy mode.
fn origin_only(url: &str) -> String {
    if let Some(scheme_end) = url.find("://") {
        let rest = &url[scheme_end + 3..];
        let host_end = rest.find('/').unwrap_or(rest.len());
        format!("{}{}", &url[..scheme_end + 3], &rest[..host_end])
    } else {
        url.to_string()
    }
}

#[derive(Deserialize)]
struct VisitIn {
    url: String,
    #[serde(default)]
    page_title: Option<String>,
    ts: i64,
    #[serde(default)]
    browser: Option<String>,
    duration_s: i64,
}

/// 16 random bytes, hex-encoded. Sourced from the OS CSPRNG.
fn gen_token() -> String {
    use std::io::Read;
    let mut buf = [0u8; 16];
    if let Ok(mut f) = std::fs::File::open("/dev/urandom") {
        let _ = f.read_exact(&mut buf);
    }
    buf.iter().map(|b| format!("{b:02x}")).collect()
}

async fn whoami(State(s): State<AppState>) -> Json<Value> {
    // The extension reads the token here. A web page can't read this response
    // (no CORS headers), and `/ingest` additionally rejects web origins + bad tokens.
    Json(json!({
        "app": "ctracking",
        "version": env!("CARGO_PKG_VERSION"),
        "token": *s.token,
    }))
}

async fn ingest(State(s): State<AppState>, headers: HeaderMap, Json(v): Json<VisitIn>) -> StatusCode {
    // Token check.
    match headers.get(TOKEN_HEADER).and_then(|h| h.to_str().ok()) {
        Some(t) if t == s.token.as_str() => {}
        _ => return StatusCode::UNAUTHORIZED,
    }
    // Reject web origins — only our extension (no Origin, or chrome-/moz-extension://).
    if let Some(o) = headers.get("origin").and_then(|h| h.to_str().ok()) {
        if o.starts_with("http://") || o.starts_with("https://") {
            return StatusCode::FORBIDDEN;
        }
    }
    // Tracking stopped: accept the request so the extension doesn't retry, but
    // don't record anything (consistent with the keyboard/window trackers).
    if s.control.paused.load(Ordering::Relaxed) {
        return StatusCode::OK;
    }
    // Domain-only privacy mode: store just the origin, and drop the page title.
    let domain_only = s.control.domain_only.load(Ordering::Relaxed);
    let (url, page_title) = if domain_only {
        (origin_only(&v.url), None)
    } else {
        (v.url, v.page_title)
    };
    let visit = BrowserVisit {
        ts: v.ts,
        url,
        page_title,
        browser: v.browser,
        duration_s: v.duration_s,
    };
    match s.db.insert_browser_visit(&visit) {
        Ok(_) => StatusCode::OK,
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

/// Start the loopback ingest server on a background thread. Returns the bound port
/// (or None if all candidates were taken) and the shared token.
pub fn start(db: Arc<Db>, control: Arc<TrackerControl>) -> BrowserLink {
    let token = gen_token();
    let token_arc = Arc::new(token.clone());
    let (tx, rx) = std::sync::mpsc::channel::<Option<u16>>();

    let token_for_task = token_arc.clone();
    thread::spawn(move || {
        let rt = match tokio::runtime::Builder::new_multi_thread()
            .worker_threads(1)
            .enable_all()
            .build()
        {
            Ok(rt) => rt,
            Err(e) => {
                eprintln!("[server] runtime build failed: {e}");
                let _ = tx.send(None);
                return;
            }
        };
        rt.block_on(async move {
            // Bind the first free candidate port (auto-fallback).
            let mut bound = None;
            for p in CANDIDATE_PORTS {
                if let Ok(l) = tokio::net::TcpListener::bind(("127.0.0.1", p)).await {
                    bound = Some((l, p));
                    break;
                }
            }
            let (listener, port) = match bound {
                Some(x) => x,
                None => {
                    eprintln!("[server] no candidate port free");
                    let _ = tx.send(None);
                    return;
                }
            };
            let _ = tx.send(Some(port));

            let state = AppState {
                db,
                token: token_for_task,
                control,
            };
            let app = Router::new()
                .route("/whoami", get(whoami))
                .route("/ingest", post(ingest))
                .with_state(state);
            if let Err(e) = axum::serve(listener, app).await {
                eprintln!("[server] serve ended: {e}");
            }
        });
    });

    let port = rx.recv().unwrap_or(None);
    BrowserLink { port, token }
}

#[cfg(test)]
mod tests {
    use super::origin_only;

    #[test]
    fn origin_only_strips_path_and_query() {
        assert_eq!(origin_only("https://github.com/a/b?c=1"), "https://github.com");
        assert_eq!(origin_only("http://example.com"), "http://example.com");
        assert_eq!(origin_only("https://sub.host.io/x"), "https://sub.host.io");
        assert_eq!(origin_only("notaurl"), "notaurl");
    }
}
