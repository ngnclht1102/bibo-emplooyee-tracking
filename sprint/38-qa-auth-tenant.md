# 38 — QA: auth & tenant model

- **Phase:** 5
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 37

## Checks
- [ ] Seed a user; login returns tokens; protected call succeeds with them.
- [ ] Tampered/expired token → 401.
- [ ] Public picker lists businesses with owner names and needs no token.
- [ ] DB shows argon2id hashes only; no plaintext anywhere in logs.
- [ ] Brute-force login attempts get throttled.
