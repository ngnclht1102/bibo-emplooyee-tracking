//! Observability: Sentry error reporting for the Rust core + a thin logging facade.
//!
//! DSN resolution mirrors the backend-URL pattern: a compile-time default that's empty
//! for `local` builds (so dev stays quiet) and the desktop-rust project otherwise, with
//! a runtime `CTRACKING_SENTRY_DSN` override. The returned guard must be kept alive for
//! the whole process (dropping it flushes pending events). The `panic` feature installs
//! a panic hook that captures Rust panics automatically.

/// Compile-time default DSN for the desktop **Rust core** Sentry project. Reporting is
/// **production-only**: empty in debug/dev builds (`tauri dev` → `debug_assertions`) and
/// in non-production release builds (staging etc.); baked in only for production release
/// builds, where end-user machines have no env vars. Override anytime with
/// `CTRACKING_SENTRY_DSN` (e.g. to smoke-test from `tauri dev`).
const DEFAULT_SENTRY_DSN: &str = if cfg!(debug_assertions) {
    ""
} else if cfg!(feature = "production") {
    "https://fa7016ecbd5b2c79337c80c48809dba4@o714773.ingest.us.sentry.io/4511603491930112"
} else {
    ""
};

/// Initialize Sentry if a DSN is configured. Keep the returned guard alive for the
/// process lifetime. Returns `None` when reporting is disabled (no DSN).
pub fn init() -> Option<sentry::ClientInitGuard> {
    let dsn = std::env::var("CTRACKING_SENTRY_DSN")
        .ok()
        .filter(|d| !d.is_empty())
        .unwrap_or_else(|| DEFAULT_SENTRY_DSN.to_string());
    if dsn.is_empty() {
        return None;
    }
    let guard = sentry::init((
        dsn,
        sentry::ClientOptions {
            release: sentry::release_name!(),
            environment: Some(crate::settings::env_label().into()),
            // Capture user IPs / request headers (per the provided config). Acceptable
            // here since this is the owner's own desktop app.
            send_default_pii: true,
            ..Default::default()
        },
    ));
    Some(guard)
}

/// Report a handled error to Sentry (no-op when disabled). Pair with a log line at the
/// call site — see the `log_err!` macro.
pub fn capture_error<E: std::error::Error + ?Sized>(err: &E) {
    sentry::capture_error(err);
}

/// Attach the signed-in user to all subsequent Sentry events (panics, captures), so the
/// owner can see *whose* desktop app failed. Call on login / session restore. No-op when
/// Sentry is disabled.
pub fn set_user(email: &str, business_id: Option<&str>) {
    let mut user = sentry::User {
        email: Some(email.to_string()),
        username: Some(email.to_string()),
        ..Default::default()
    };
    if let Some(b) = business_id {
        user.other.insert("business_id".to_string(), b.to_string().into());
    }
    sentry::configure_scope(move |scope| scope.set_user(Some(user)));
}

/// Clear the Sentry user on logout.
pub fn clear_user() {
    sentry::configure_scope(|scope| scope.set_user(None));
}

/// Emit a log line to stderr and leave a Sentry breadcrumb (so prior context rides along
/// with the next captured event). `level` is the Sentry breadcrumb level. Used by the
/// `log_info!` / `log_warn!` / `log_err!` macros — call those, not this, at call sites.
pub fn log(level: sentry::Level, tag: &str, message: &str) {
    eprintln!("[{tag}] {message}");
    sentry::add_breadcrumb(sentry::Breadcrumb {
        category: Some(tag.to_string()),
        message: Some(message.to_string()),
        level,
        ..Default::default()
    });
}

/// Structured-ish logging: `log_info!("sync", "POST {} -> {}", path, status)`.
/// Writes to stderr AND records a Sentry breadcrumb. No-op breadcrumb when disabled.
#[macro_export]
macro_rules! log_info {
    ($tag:expr, $($arg:tt)*) => {
        $crate::obs::log(sentry::Level::Info, $tag, &format!($($arg)*))
    };
}
#[macro_export]
macro_rules! log_warn {
    ($tag:expr, $($arg:tt)*) => {
        $crate::obs::log(sentry::Level::Warning, $tag, &format!($($arg)*))
    };
}
#[macro_export]
macro_rules! log_err {
    ($tag:expr, $($arg:tt)*) => {
        $crate::obs::log(sentry::Level::Error, $tag, &format!($($arg)*))
    };
}

/// Report a message to Sentry at the given level with optional structured extras.
/// `source`/`extras` are attached as tags so events from the extension, sync, etc. are
/// filterable. No-op when Sentry is disabled.
pub fn capture_message(level: sentry::Level, message: &str, source: &str, extras: &[(&str, String)]) {
    sentry::with_scope(
        |scope| {
            scope.set_tag("source", source);
            for (k, v) in extras {
                scope.set_extra(k, v.clone().into());
            }
        },
        || {
            sentry::capture_message(message, level);
        },
    );
}
