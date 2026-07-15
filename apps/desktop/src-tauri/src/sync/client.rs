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
    #[serde(default)]
    user: Option<LoginUser>,
}

/// The identity block returned alongside the tokens on login. Captured into the
/// session so the UI can show the user's name and gate the Admin section.
#[derive(Deserialize, Default)]
struct LoginUser {
    #[serde(default)]
    email: String,
    #[serde(default)]
    username: String,
    #[serde(default)]
    display_name: String,
    #[serde(default)]
    account_type: String,
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
        let user = parsed.user.unwrap_or_default();
        Ok(Session {
            access_token: parsed.tokens.access_token,
            refresh_token: parsed.tokens.refresh_token,
            email: if user.email.is_empty() { email.to_string() } else { user.email },
            business_id: business_id.map(|s| s.to_string()),
            display_name: user.display_name,
            username: user.username,
            account_type: user.account_type,
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
// The native in-app Admin section reuses the tracker's own signed-in session
// (a single login): the commands read the access token from `AuthState` via
// `BackendClient`, so token refresh is shared and no token is held in the React
// layer. Whether the user may see the dashboard is decided by `owner_businesses`
// returning ≥1 workspace (the backend scopes it to `owner_user_id = caller`).

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

// ---- per-employee detail reports (native EmployeeDetail) ----

#[derive(Deserialize, Serialize)]
pub struct ActivitySampleRow {
    pub ts: i64,
    pub app_name: String,
    #[serde(default)]
    pub window_title: Option<String>,
    pub duration_s: i64,
}

#[derive(Deserialize, Serialize)]
pub struct ActivityBreakdownRow {
    pub app_name: String,
    pub duration_s: i64,
}

/// Full body of `GET /v1/reports/employees/{id}/activity`.
#[derive(Deserialize, Serialize)]
pub struct EmployeeActivity {
    #[serde(default)]
    pub samples: Vec<ActivitySampleRow>,
    #[serde(default)]
    pub breakdown: Vec<ActivityBreakdownRow>,
}

#[derive(Deserialize, Serialize)]
pub struct KeystrokeBucketRow {
    pub ts_bucket: i64,
    pub count: i64,
}

#[derive(Deserialize)]
struct KeystrokesResp {
    #[serde(default)]
    buckets: Vec<KeystrokeBucketRow>,
}

#[derive(Deserialize, Serialize)]
pub struct BrowserVisitRow {
    pub ts: i64,
    pub url: String,
    #[serde(default)]
    pub page_title: Option<String>,
    #[serde(default)]
    pub browser: Option<String>,
    pub duration_s: i64,
}

#[derive(Deserialize)]
struct BrowserResp {
    #[serde(default)]
    visits: Vec<BrowserVisitRow>,
}

#[derive(Deserialize, Serialize)]
pub struct ScreenshotMetaRow {
    pub client_uuid: String,
    pub ts: i64,
    pub byte_size: i64,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub display_id: Option<i64>,
}

/// Paginated body of `GET /v1/reports/employees/{id}/screenshots`.
#[derive(Deserialize, Serialize)]
pub struct ScreenshotPage {
    #[serde(default)]
    pub screenshots: Vec<ScreenshotMetaRow>,
    #[serde(default)]
    pub limit: i64,
    #[serde(default)]
    pub offset: i64,
}

// ---- member management (Members screen) ----

#[derive(Serialize)]
struct CreateEmployeeReq<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    email: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    username: Option<&'a str>,
    password: &'a str,
    display_name: &'a str,
    business_id: &'a str,
}

/// The created member returned by `POST /v1/employees` (under `employee`).
#[derive(Deserialize, Serialize, Default)]
pub struct CreatedEmployee {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub display_name: String,
}

#[derive(Deserialize)]
struct CreateEmployeeResp {
    #[serde(default)]
    employee: CreatedEmployee,
}

impl BackendClient {
    /// `GET /v1/businesses/mine` (auto-refresh on 401) — the workspaces the
    /// signed-in user owns. Empty ⇒ the user is not an owner, so the UI shows the
    /// "no admin access" state.
    pub async fn owner_businesses(&self) -> Result<Vec<OwnerBusiness>, String> {
        let mut token = self.access_token()?;
        for attempt in 0..2 {
            let resp = self
                .http
                .get(self.url("/v1/businesses/mine"))
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
            let parsed: OwnerBusinessesResp = resp.json().await.map_err(|e| e.to_string())?;
            return Ok(parsed.businesses);
        }
        Err("owner_businesses: unreachable retry exhaustion".into())
    }

    /// `GET /v1/reports/employees?business_id=…` (auto-refresh on 401) — today's
    /// roster for one owned workspace.
    pub async fn owner_roster(&self, business_id: &str) -> Result<Vec<RosterEntry>, String> {
        let mut token = self.access_token()?;
        for attempt in 0..2 {
            let resp = self
                .http
                .get(self.url("/v1/reports/employees"))
                .query(&[("business_id", business_id)])
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
            let parsed: RosterResp = resp.json().await.map_err(|e| e.to_string())?;
            return Ok(parsed.employees);
        }
        Err("owner_roster: unreachable retry exhaustion".into())
    }

    /// `GET /v1/reports/employees/{id}/activity?from=&to=` (auto-refresh on 401).
    pub async fn owner_employee_activity(
        &self,
        employee_id: &str,
        from: i64,
        to: i64,
    ) -> Result<EmployeeActivity, String> {
        let path = format!("/v1/reports/employees/{employee_id}/activity");
        let mut token = self.access_token()?;
        for attempt in 0..2 {
            let resp = self
                .http
                .get(self.url(&path))
                .query(&[("from", from.to_string()), ("to", to.to_string())])
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
        Err("owner_employee_activity: unreachable retry exhaustion".into())
    }

    /// `GET /v1/reports/employees/{id}/keystrokes?from=&to=` (auto-refresh on 401).
    pub async fn owner_employee_keystrokes(
        &self,
        employee_id: &str,
        from: i64,
        to: i64,
    ) -> Result<Vec<KeystrokeBucketRow>, String> {
        let path = format!("/v1/reports/employees/{employee_id}/keystrokes");
        let mut token = self.access_token()?;
        for attempt in 0..2 {
            let resp = self
                .http
                .get(self.url(&path))
                .query(&[("from", from.to_string()), ("to", to.to_string())])
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
            let parsed: KeystrokesResp = resp.json().await.map_err(|e| e.to_string())?;
            return Ok(parsed.buckets);
        }
        Err("owner_employee_keystrokes: unreachable retry exhaustion".into())
    }

    /// `GET /v1/reports/employees/{id}/browser?from=&to=` (auto-refresh on 401).
    pub async fn owner_employee_browser(
        &self,
        employee_id: &str,
        from: i64,
        to: i64,
    ) -> Result<Vec<BrowserVisitRow>, String> {
        let path = format!("/v1/reports/employees/{employee_id}/browser");
        let mut token = self.access_token()?;
        for attempt in 0..2 {
            let resp = self
                .http
                .get(self.url(&path))
                .query(&[("from", from.to_string()), ("to", to.to_string())])
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
            let parsed: BrowserResp = resp.json().await.map_err(|e| e.to_string())?;
            return Ok(parsed.visits);
        }
        Err("owner_employee_browser: unreachable retry exhaustion".into())
    }

    /// `GET /v1/reports/employees/{id}/screenshots?limit=&offset=` (auto-refresh on 401).
    pub async fn owner_employee_screenshots(
        &self,
        employee_id: &str,
        limit: u32,
        offset: u32,
    ) -> Result<ScreenshotPage, String> {
        let path = format!("/v1/reports/employees/{employee_id}/screenshots");
        let mut token = self.access_token()?;
        for attempt in 0..2 {
            let resp = self
                .http
                .get(self.url(&path))
                .query(&[("limit", limit.to_string()), ("offset", offset.to_string())])
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
        Err("owner_employee_screenshots: unreachable retry exhaustion".into())
    }

    /// `GET /v1/screenshots/{client_uuid}` (auto-refresh on 401) — the raw image
    /// bytes plus its content-type, so a Tauri command can build a `data:` URL.
    pub async fn owner_screenshot_bytes(
        &self,
        client_uuid: &str,
    ) -> Result<(Vec<u8>, String), String> {
        let path = format!("/v1/screenshots/{client_uuid}");
        let mut token = self.access_token()?;
        for attempt in 0..2 {
            let resp = self
                .http
                .get(self.url(&path))
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
            let content_type = resp
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .unwrap_or("image/webp")
                .to_string();
            let bytes = resp.bytes().await.map_err(|e| e.to_string())?.to_vec();
            return Ok((bytes, content_type));
        }
        Err("owner_screenshot_bytes: unreachable retry exhaustion".into())
    }

    /// `POST /v1/employees` (auto-refresh on 401) — pre-provision a member in an
    /// owned workspace. Exactly one of `email`/`username` should be set.
    pub async fn owner_create_employee(
        &self,
        business_id: &str,
        display_name: &str,
        email: Option<&str>,
        username: Option<&str>,
        password: &str,
    ) -> Result<CreatedEmployee, String> {
        let body = CreateEmployeeReq { email, username, password, display_name, business_id };
        let mut token = self.access_token()?;
        for attempt in 0..2 {
            let resp = self
                .http
                .post(self.url("/v1/employees"))
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
            let parsed: CreateEmployeeResp = resp.json().await.map_err(|e| e.to_string())?;
            return Ok(parsed.employee);
        }
        Err("owner_create_employee: unreachable retry exhaustion".into())
    }

    /// `POST /v1/businesses` (auto-refresh on 401) — create a workspace owned by
    /// the caller. The kind (team/family) is decided server-side from the owner's
    /// account type. Returns the new business.
    pub async fn owner_create_business(&self, name: &str) -> Result<OwnerBusiness, String> {
        let body = serde_json::json!({ "name": name });
        let mut token = self.access_token()?;
        for attempt in 0..2 {
            let resp = self
                .http
                .post(self.url("/v1/businesses"))
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
            return resp.json().await.map_err(|e| e.to_string());
        }
        Err("owner_create_business: unreachable retry exhaustion".into())
    }
}
