//! Backend sync: auth/session (task 51) and the push worker (task 53).
//!
//! One-directional dataflow (docs/11): the desktop only *sends* local rows to the
//! Go backend; activity is never pulled back. The local SQLite file stays the
//! source of truth, so sync is best-effort — offline just means rows stay pending.
//!
//! Layout:
//! - `auth`   — login/logout/session, tokens in the macOS Keychain.
//! - `client` — HTTP client over `reqwest` with auto-refresh on 401.
//! - `worker` — background task that batches pending rows to the backend.

pub mod auth;
pub mod client;
pub mod worker;

pub use auth::AuthState;

/// How many rows we pull per table per sync pass (docs/11 suggests ~500).
pub const BATCH_LIMIT: i64 = 500;
