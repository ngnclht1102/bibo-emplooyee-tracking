# 51 — Desktop: auth / session storage

- **Phase:** 5
- **Type:** Implementation
- **Status:** Done (pending live-backend QA)
- **Blocked by:** 37, 49
- **Blocks:** 53, 57

## Goal
Desktop can authenticate and persist a session securely.

## Scope
- Backend base URL configurable (settings/env).
- Tauri commands: fetch public business list, `login(email, password, business_id?)`,
  `logout`, `current_session`.
- Store access + refresh tokens in the macOS **Keychain** (not plaintext on disk).
- Auto-refresh access token on expiry; surface auth errors to the UI.
- Send `device_id` (task 49) with auth/sync.

## Acceptance criteria
- [x] Login stores tokens in Keychain; survives app restart. *(code path: `AuthState::store` → keychain `Entry`; loaded on startup via `AuthState::load`. Needs live backend to verify end-to-end.)*
- [x] Expired access token auto-refreshes transparently. *(`BackendClient` retries once on 401 via `POST /v1/auth/refresh`. Needs live backend.)*
- [x] Logout clears stored tokens. *(`AuthState::clear` deletes the keychain entry; idempotent.)*
- [x] Wrong credentials surface a clear error, no token stored. *(login only stores on 2xx; non-2xx returns the backend body as an error string.)*

## Notes
- New module `sync/` with `auth.rs` (keychain + `AuthState`) and `client.rs`
  (`reqwest` client). Tokens stored as JSON in macOS Keychain under service
  `com.ctracking.desktop` / account `session` via the `keyring` crate
  (`apple-native` feature). Never written to disk in plaintext.
- Commands: `list_businesses`, `login(email,password,business_id?)`, `logout`,
  `current_session`. `backend_url` is a setting (default `http://localhost:8080`).
- `device_id` (task 49) is sent on every sync request.
- Could NOT verify against a live backend (not running in this environment) — the
  exact login/refresh response field names (`access_token`/`refresh_token`) and the
  public-business shape (`business_id`/`name`/`owner_name`) are taken from docs/11
  and the backend contract; confirm they match the Go handlers during QA.
