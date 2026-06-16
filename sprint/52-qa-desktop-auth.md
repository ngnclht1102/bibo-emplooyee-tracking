# 52 — QA: desktop auth

- **Phase:** 5
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 51

## Checks
- [ ] Log in from desktop; restart app → still logged in.
- [ ] Tokens stored in Keychain, not readable as plaintext on disk.
- [ ] Force token expiry → auto-refresh keeps the session.
- [ ] Logout clears session; wrong password shows an error.
