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

/// `GET /v1/public/businesses` wraps the list under `businesses`.
#[derive(Deserialize)]
struct PublicBusinessesResp {
    businesses: Vec<PublicBusiness>,
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

/// `GET /v1/policy` — the org's capture policy for the signed-in employee.
/// `managed` is false for standalone users (no org), in which case the desktop
/// keeps its local defaults.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct Policy {
    pub managed: bool,
    #[serde(default)]
    pub allow_employee_override: bool,
    #[serde(default)]
    pub screenshot_interval_s: Option<u64>,
    #[serde(default)]
    pub idle_threshold_s: Option<u64>,
    #[serde(default)]
    pub screenshot_retention_days: Option<u64>,
    /// 'team' | 'family' — drives the onboarding copy (employee vs kid).
    #[serde(default)]
    pub kind: Option<String>,
    /// "full_screen" | "active_window" — org-set screenshot capture mode.
    #[serde(default)]
    pub screenshot_mode: Option<String>,
    /// App names whose capture ticks are skipped entirely while frontmost.
    #[serde(default)]
    pub screenshot_skip_apps: Option<Vec<String>>,
}

/// One category of the backend's curated sensitive-app list
/// (`GET /v1/public/screenshot-privacy-apps`). Serialized back to the UI as-is.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrivacyAppCategory {
    pub key: String,
    pub apps: Vec<String>,
}

#[derive(Deserialize)]
struct PrivacyAppsResp {
    categories: Vec<PrivacyAppCategory>,
}

/// `GET /v1/public/screenshot-privacy-apps` — the curated sensitive-app list
/// (privacy-mode auto-skip + UI suggestions). Public, no auth: personal
/// (no-account) users need it too, so this is a free function that doesn't
/// require a session. Callers fall back to the baked-in
/// `trackers::DEFAULT_PRIVACY_APPS` on any error.
pub async fn fetch_privacy_apps(base_url: &str) -> Result<Vec<PrivacyAppCategory>, String> {
    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .unwrap_or_default();
    let url = format!(
        "{}/v1/public/screenshot-privacy-apps",
        base_url.trim_end_matches('/')
    );
    let resp = http.get(url).send().await.map_err(net_err)?;
    if !resp.status().is_success() {
        return Err(status_err(resp).await);
    }
    let parsed: PrivacyAppsResp = resp.json().await.map_err(|e| e.to_string())?;
    Ok(parsed.categories)
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
        let parsed: PublicBusinessesResp = resp.json().await.map_err(|e| e.to_string())?;
        Ok(parsed.businesses)
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

    /// `GET /v1/policy` with auto-refresh on 401.
    pub async fn fetch_policy(&self) -> Result<Policy, String> {
        let mut token = self.access_token()?;
        for attempt in 0..2 {
            let resp = self
                .http
                .get(self.url("/v1/policy"))
                .bearer_auth(&token)
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
            return resp.json().await.map_err(|e| e.to_string());
        }
        Err("fetch_policy: unreachable retry exhaustion".into())
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
            let resp = match self
                .http
                .post(self.url("/v1/sync/batch"))
                .bearer_auth(&token)
                .json(&body)
                .send()
                .await
            {
                Ok(r) => r,
                Err(e) => {
                    crate::log_warn!("sync", "POST /v1/sync/batch network error: {e}");
                    return Err(net_err(e));
                }
            };

            let status = resp.status();
            if status == reqwest::StatusCode::UNAUTHORIZED && attempt == 0 {
                crate::log_info!("sync", "POST /v1/sync/batch -> 401, refreshing token");
                token = self.refresh().await?;
                continue;
            }
            if !status.is_success() {
                crate::log_warn!("sync", "POST /v1/sync/batch -> {status}");
                return Err(status_err(resp).await);
            }
            let parsed: BatchResp = resp.json().await.map_err(|e| e.to_string())?;
            crate::log_info!(
                "sync",
                "POST /v1/sync/batch -> {} (act={} keys={} br={})",
                status.as_u16(),
                activity.len(),
                keystrokes.len(),
                browser.len()
            );
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
        // Screenshots are already compressed to a small WebP at capture time, so
        // upload the file as-is. Read once; reused across the (rare) retry.
        let bytes = std::fs::read(&shot.file_path)
            .map_err(|e| format!("read screenshot {}: {e}", shot.file_path))?;
        let file_name = format!("{}.webp", shot.client_uuid);

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

// ---------- admin (owner) dashboard ----------
// Standalone helpers for the native in-app Admin screen. The owner's access token
// is passed in explicitly and kept in the React layer — NOT in the tracker's
// `AuthState`/keychain — so signing into admin never flips the tracker into a
// signed-in state or touches its session.

#[derive(Deserialize, Serialize)]
pub struct AdminUser {
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub username: String,
    pub display_name: String,
    #[serde(default)]
    pub account_type: String,
}

#[derive(Deserialize, Serialize)]
pub struct AdminLoginResult {
    pub access_token: String,
    pub user: AdminUser,
}

#[derive(Serialize)]
struct AdminLoginReq<'a> {
    identifier: &'a str,
    password: &'a str,
}

#[derive(Deserialize)]
struct AdminLoginResp {
    tokens: TokenResp,
    user: AdminUser,
}

#[derive(Deserialize, Serialize)]
pub struct OwnerBusiness {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub kind: String,
}

#[derive(Deserialize)]
struct OwnerBusinessesResp {
    businesses: Vec<OwnerBusiness>,
}

/// One employee row for the admin roster (mirrors the backend `RosterEntry`).
#[derive(Deserialize, Serialize)]
pub struct RosterEntry {
    pub id: String,
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub username: String,
    pub display_name: String,
    pub role: String,
    pub last_seen: Option<i64>,
    pub active_today_s: i64,
    pub active_yesterday_s: i64,
    pub screenshots_today: i64,
    #[serde(default)]
    pub screenshots_yesterday: i64,
    pub focus_pct_today: Option<i64>,
}

#[derive(Deserialize)]
struct RosterResp {
    employees: Vec<RosterEntry>,
}

fn admin_http() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap_or_default()
}

/// `POST /v1/auth/login` for the owner. Returns the access token + user, without
/// persisting anything (the React admin screen holds the token for its lifetime).
pub async fn admin_login(
    base_url: &str,
    identifier: &str,
    password: &str,
) -> Result<AdminLoginResult, String> {
    let base = base_url.trim_end_matches('/');
    let resp = admin_http()
        .post(format!("{base}/v1/auth/login"))
        .json(&AdminLoginReq {
            identifier,
            password,
        })
        .send()
        .await
        .map_err(net_err)?;
    if !resp.status().is_success() {
        return Err(status_err(resp).await);
    }
    let parsed: AdminLoginResp = resp.json().await.map_err(|e| e.to_string())?;
    Ok(AdminLoginResult {
        access_token: parsed.tokens.access_token,
        user: parsed.user,
    })
}

/// `GET /v1/businesses/mine` — the workspaces this owner owns.
pub async fn admin_businesses(base_url: &str, token: &str) -> Result<Vec<OwnerBusiness>, String> {
    let base = base_url.trim_end_matches('/');
    let resp = admin_http()
        .get(format!("{base}/v1/businesses/mine"))
        .bearer_auth(token)
        .send()
        .await
        .map_err(net_err)?;
    if !resp.status().is_success() {
        return Err(status_err(resp).await);
    }
    let parsed: OwnerBusinessesResp = resp.json().await.map_err(|e| e.to_string())?;
    Ok(parsed.businesses)
}

/// `GET /v1/reports/employees?business_id=…` — today's roster for one workspace.
pub async fn admin_roster(
    base_url: &str,
    token: &str,
    business_id: &str,
) -> Result<Vec<RosterEntry>, String> {
    let base = base_url.trim_end_matches('/');
    let resp = admin_http()
        .get(format!("{base}/v1/reports/employees"))
        .query(&[("business_id", business_id)])
        .bearer_auth(token)
        .send()
        .await
        .map_err(net_err)?;
    if !resp.status().is_success() {
        return Err(status_err(resp).await);
    }
    let parsed: RosterResp = resp.json().await.map_err(|e| e.to_string())?;
    Ok(parsed.employees)
}
