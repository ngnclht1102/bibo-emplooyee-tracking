//! Auth / session (task 51).
//!
//! Stores the access + refresh tokens in a JSON file in the app data dir (mode
//! 0600 on unix) and keeps an in-memory cache for the UI and the sync worker. A
//! file avoids the macOS Keychain access prompt; the tradeoff is tokens at rest on
//! disk (readable only by the user). HTTP calls live in [`super::client`].

use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

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

/// Managed Tauri state: the current session, mirrored to a file on disk.
///
/// The `Mutex<Option<Session>>` is the live cache; the file is the durable copy
/// that survives restarts. Both are kept in lock-step by `store` / `clear`.
pub struct AuthState {
    path: PathBuf,
    current: Mutex<Option<Session>>,
}

impl AuthState {
    /// Build the state, loading any persisted session from `path`.
    pub fn load(path: PathBuf) -> Self {
        let current = read_file(&path);
        // Identify the restored user to Sentry up front (covers crashes before any login).
        if let Some(s) = &current {
            crate::obs::set_user(&s.email, s.business_id.as_deref());
        }
        AuthState {
            path,
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

    /// Persist a session to disk and the in-memory cache.
    pub fn store(&self, session: Session) -> Result<(), String> {
        write_file(&self.path, &session)?;
        crate::obs::set_user(&session.email, session.business_id.as_deref());
        *self.current.lock().unwrap() = Some(session);
        Ok(())
    }

    /// Replace just the tokens after a refresh, preserving identity fields.
    pub fn update_tokens(&self, access_token: String, refresh_token: String) -> Result<(), String> {
        let mut guard = self.current.lock().unwrap();
        if let Some(s) = guard.as_mut() {
            s.access_token = access_token;
            s.refresh_token = refresh_token;
            write_file(&self.path, s)?;
        }
        Ok(())
    }

    /// Forget the session everywhere (logout).
    pub fn clear(&self) -> Result<(), String> {
        match std::fs::remove_file(&self.path) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string()),
        }
        *self.current.lock().unwrap() = None;
        crate::obs::clear_user();
        Ok(())
    }
}

/// Read + deserialize the persisted session. Missing/invalid file → `None`.
fn read_file(path: &PathBuf) -> Option<Session> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
}

fn write_file(path: &PathBuf, session: &Session) -> Result<(), String> {
    let json = serde_json::to_string(session).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}
