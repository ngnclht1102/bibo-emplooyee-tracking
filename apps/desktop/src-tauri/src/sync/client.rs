//! HTTP client for the backend (tasks 51 + 53).
//!
//! Wraps `reqwest` with the two cross-cutting concerns from docs/11:
//! - **Bearer auth** from the current [`super::auth::Session`].
//! - **Auto-refresh on 401** via `POST /v1/auth/refresh`, retrying the call once.
//!
//! All request/response shapes mirror the backend contract exactly (see docs/11
//! "Sync"). Errors are surfaced as `String` to match the existing command style.

use std::sync::Arc;

use serde::{Deserialize, Serialize};

use super::auth::{AuthState, Session};
use crate::storage::{PendingActivity, PendingBrowser, PendingKeystroke, PendingScreenshot};

/// A backend client bound to a base URL and the shared auth state.
#[derive(Clone)]
pub struct BackendClient {
    http: reqwest::Client,
    base_url: String,
    auth: Arc<AuthState>,
}

// ---------- public (no token) ----------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicBusiness {
    pub business_id: String,
    pub name: String,
    pub owner_name: String,
}

#[derive(Serialize)]
struct LoginReq<'a> {
    email: &'a str,
    password: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    business_id: Option<&'a str>,
}

#[derive(Deserialize)]
struct TokenResp {
    access_token: String,
    refresh_token: String,
}

/// `POST /v1/auth/login` nests the tokens under `tokens` (alongside `user`),
/// whereas `POST /v1/auth/refresh` returns them at the top level. Mirror the
/// backend exactly rather than assume a uniform shape.
#[derive(Deserialize)]
struct LoginResp {
    tokens: TokenResp,
}

#[derive(Serialize)]
struct RefreshReq<'a> {
    refresh_token: &'a str,
}

// ---------- sync batch contract (docs/11) ----------

#[derive(Serialize)]
struct BatchReq<'a> {
    device_id: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    device_label: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    business_id: Option<&'a str>,
    activity: &'a [PendingActivity],
    keystrokes: &'a [PendingKeystroke],
    browser: &'a [PendingBrowser],
}

/// The backend echoes back exactly the `client_uuid`s it accepted, per kind.
#[derive(Debug, Deserialize, Default)]
pub struct BatchAccepted {
    #[serde(default)]
    pub activity: Vec<String>,
    #[serde(default)]
    pub keystrokes: Vec<String>,
    #[serde(default)]
    pub browser: Vec<String>,
}

#[derive(Deserialize)]
struct BatchResp {
    accepted: BatchAccepted,
}

#[derive(Deserialize)]
struct ScreenshotResp {
    accepted: Vec<String>,
}

impl BackendClient {
    pub fn new(base_url: String, auth: Arc<AuthState>) -> Self {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .unwrap_or_default();
        BackendClient {
            http,
            base_url: base_url.trim_end_matches('/').to_string(),
            auth,
        }
    }

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.base_url, path)
    }

    // ---------- public / auth ----------

    /// `GET /v1/public/businesses` — powers the login picker. No token needed.
    pub async fn list_businesses(&self) -> Result<Vec<PublicBusiness>, String> {
        let resp = self
            .http
            .get(self.url("/v1/public/businesses"))
            .send()
            .await
            .map_err(net_err)?;
        if !resp.status().is_success() {
            return Err(status_err(resp).await);
        }
        resp.json().await.map_err(|e| e.to_string())
    }

    /// `POST /v1/auth/login`. On success returns the session (does NOT persist it —
    /// the command stores it so the keychain write is explicit).
    pub async fn login(
        &self,
        email: &str,
        password: &str,
        business_id: Option<&str>,
    ) -> Result<Session, String> {
        let resp = self
            .http
            .post(self.url("/v1/auth/login"))
            .json(&LoginReq {
                email,
                password,
                business_id,
            })
            .send()
            .await
            .map_err(net_err)?;
        if !resp.status().is_success() {
            return Err(status_err(resp).await);
        }
        let parsed: LoginResp = resp.json().await.map_err(|e| e.to_string())?;
        Ok(Session {
            access_token: parsed.tokens.access_token,
            refresh_token: parsed.tokens.refresh_token,
            email: email.to_string(),
            business_id: business_id.map(|s| s.to_string()),
        })
    }

    /// `POST /v1/auth/refresh`. Updates the stored tokens in place on success.
    /// Returns the new access token. Caller (the 401 retry path) re-issues the
    /// original request with it.
    async fn refresh(&self) -> Result<String, String> {
        let refresh_token = self
            .auth
            .session()
            .map(|s| s.refresh_token)
            .ok_or_else(|| "not logged in".to_string())?;
        let resp = self
            .http
            .post(self.url("/v1/auth/refresh"))
            .json(&RefreshReq {
                refresh_token: &refresh_token,
            })
            .send()
            .await
            .map_err(net_err)?;
        if !resp.status().is_success() {
            // Refresh itself failed (expired/revoked) → force logout so the UI prompts.
            let _ = self.auth.clear();
            return Err("session expired, please sign in again".to_string());
        }
        let t: TokenResp = resp.json().await.map_err(|e| e.to_string())?;
        self.auth
            .update_tokens(t.access_token.clone(), t.refresh_token)?;
        Ok(t.access_token)
    }

    /// Current access token, or an error if logged out.
    fn access_token(&self) -> Result<String, String> {
        self.auth
            .session()
            .map(|s| s.access_token)
            .ok_or_else(|| "not logged in".to_string())
    }

    // ---------- sync (task 53) ----------

    /// `POST /v1/sync/batch` with auto-refresh on 401. Returns the accepted uuids
    /// per kind. `device_id` and the (optional) `business_id` come from settings/
    /// session.
    pub async fn sync_batch(
        &self,
        device_id: &str,
        business_id: Option<&str>,
        activity: &[PendingActivity],
        keystrokes: &[PendingKeystroke],
        browser: &[PendingBrowser],
    ) -> Result<BatchAccepted, String> {
        let body = BatchReq {
            device_id,
            device_label: None,
            business_id,
            activity,
            keystrokes,
            browser,
        };

        // First attempt + one retry after a refresh on 401.
        let mut token = self.access_token()?;
        for attempt in 0..2 {
            let resp = self
                .http
                .post(self.url("/v1/sync/batch"))
                .bearer_auth(&token)
                .json(&body)
                .send()
                .await
                .map_err(net_err)?;

            if resp.status() == reqwest::StatusCode::UNAUTHORIZED && attempt == 0 {
                token = self.refresh().await?;
                continue;
            }
            if !resp.status().is_success() {
                return Err(status_err(resp).await);
            }
            let parsed: BatchResp = resp.json().await.map_err(|e| e.to_string())?;
            return Ok(parsed.accepted);
        }
        Err("sync_batch: unreachable retry exhaustion".into())
    }

    /// `POST /v1/sync/screenshots` (multipart) for a single screenshot, with the
    /// same 401→refresh→retry behavior. Returns the accepted uuid(s).
    pub async fn sync_screenshot(
        &self,
        device_id: &str,
        business_id: Option<&str>,
        shot: &PendingScreenshot,
    ) -> Result<Vec<String>, String> {
        // Read the bytes once; reused across the (rare) retry.
        let bytes = std::fs::read(&shot.file_path)
            .map_err(|e| format!("read screenshot {}: {e}", shot.file_path))?;
        let file_name = std::path::Path::new(&shot.file_path)
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| format!("{}.webp", shot.client_uuid));

        let mut token = self.access_token()?;
        for attempt in 0..2 {
            let mut form = reqwest::multipart::Form::new()
                .text("client_uuid", shot.client_uuid.clone())
                .text("device_id", device_id.to_string())
                .text("ts", shot.ts.to_string())
                .text("updated_at", shot.updated_at.to_string());
            if let Some(w) = shot.width {
                form = form.text("width", w.to_string());
            }
            if let Some(h) = shot.height {
                form = form.text("height", h.to_string());
            }
            if let Some(d) = shot.display_id {
                form = form.text("display_id", d.to_string());
            }
            if let Some(b) = business_id {
                form = form.text("business_id", b.to_string());
            }
            let part = reqwest::multipart::Part::bytes(bytes.clone())
                .file_name(file_name.clone())
                .mime_str("image/webp")
                .map_err(|e| e.to_string())?;
            form = form.part("image", part);

            let resp = self
                .http
                .post(self.url("/v1/sync/screenshots"))
                .bearer_auth(&token)
                .multipart(form)
                .send()
                .await
                .map_err(net_err)?;

            if resp.status() == reqwest::StatusCode::UNAUTHORIZED && attempt == 0 {
                token = self.refresh().await?;
                continue;
            }
            if !resp.status().is_success() {
                return Err(status_err(resp).await);
            }
            let parsed: ScreenshotResp = resp.json().await.map_err(|e| e.to_string())?;
            return Ok(parsed.accepted);
        }
        Err("sync_screenshot: unreachable retry exhaustion".into())
    }
}

/// Network-level failure (connection refused, DNS, timeout). The worker treats
/// these as "offline / backend down" → backoff, not a hard error.
fn net_err(e: reqwest::Error) -> String {
    format!("network error: {e}")
}

/// Turn a non-2xx response into a readable error, including the body if short.
async fn status_err(resp: reqwest::Response) -> String {
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    if body.is_empty() {
        format!("backend returned {status}")
    } else {
        format!("backend returned {status}: {body}")
    }
}
