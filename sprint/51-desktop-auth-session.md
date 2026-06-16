# 51 — Desktop: auth / session storage

- **Phase:** 5
- **Type:** Implementation
- **Status:** Blocked
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
- [ ] Login stores tokens in Keychain; survives app restart.
- [ ] Expired access token auto-refreshes transparently.
- [ ] Logout clears stored tokens.
- [ ] Wrong credentials surface a clear error, no token stored.
