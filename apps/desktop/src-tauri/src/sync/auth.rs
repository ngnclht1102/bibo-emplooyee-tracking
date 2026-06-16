//! Auth / session (task 51).
//!
//! Stores the access + refresh tokens in the macOS Keychain (never plaintext on
//! disk) and keeps a small in-memory cache of the current session for the UI and
//! the sync worker. The actual HTTP calls live in [`super::client`]; this module
//! owns secure storage and the shared session state.

use std::sync::Mutex;

use keyring::Entry;
use serde::{Deserialize, Serialize};

/// Keychain service name; the account is fixed since there's one session per install.
const KEYCHAIN_SERVICE: &str = "com.ctracking.desktop";
const KEYCHAIN_ACCOUNT: &str = "session";

/// Tokens + identity returned by the backend on login / refresh.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub access_token: String,
    pub refresh_token: String,
    /// The signed-in user's email (for display in the UI).
    #[serde(default)]
    pub email: String,
    /// Resolved business id, if the login picked one.
    #[serde(default)]
    pub business_id: Option<String>,
}

/// Managed Tauri state: the current session, mirrored in the Keychain.
///
/// The `Mutex<Option<Session>>` is the live cache; the Keychain is the durable copy
/// that survives restarts. Both are kept in lock-step by `store` / `clear`.
pub struct AuthState {
    current: Mutex<Option<Session>>,
}

impl AuthState {
    /// Build the state, loading any persisted session from the Keychain.
    pub fn load() -> Self {
        let current = read_keychain();
        AuthState {
            current: Mutex::new(current),
        }
    }

    /// Snapshot the current session (cheap clone), or `None` when logged out.
    pub fn session(&self) -> Option<Session> {
        self.current.lock().unwrap().clone()
    }

    /// True if a session exists. Used by the worker to skip syncing when logged out.
    pub fn is_logged_in(&self) -> bool {
        self.current.lock().unwrap().is_some()
    }

    /// Persist a session to the Keychain and the in-memory cache.
    pub fn store(&self, session: Session) -> Result<(), String> {
        write_keychain(&session)?;
        *self.current.lock().unwrap() = Some(session);
        Ok(())
    }

    /// Replace just the tokens after a refresh, preserving identity fields.
    pub fn update_tokens(&self, access_token: String, refresh_token: String) -> Result<(), String> {
        let mut guard = self.current.lock().unwrap();
        if let Some(s) = guard.as_mut() {
            s.access_token = access_token;
            s.refresh_token = refresh_token;
            write_keychain(s)?;
        }
        Ok(())
    }

    /// Forget the session everywhere (logout).
    pub fn clear(&self) -> Result<(), String> {
        delete_keychain()?;
        *self.current.lock().unwrap() = None;
        Ok(())
    }
}

fn entry() -> Result<Entry, String> {
    Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT).map_err(|e| e.to_string())
}

/// Read + deserialize the persisted session. Missing entry → `None`.
fn read_keychain() -> Option<Session> {
    let e = entry().ok()?;
    match e.get_password() {
        Ok(json) => serde_json::from_str(&json).ok(),
        Err(_) => None,
    }
}

fn write_keychain(session: &Session) -> Result<(), String> {
    let json = serde_json::to_string(session).map_err(|e| e.to_string())?;
    entry()?.set_password(&json).map_err(|e| e.to_string())
}

fn delete_keychain() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) => Ok(()),
        // Already gone is fine for an idempotent logout.
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
