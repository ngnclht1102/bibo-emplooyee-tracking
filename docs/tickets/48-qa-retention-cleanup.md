# 48 — QA: retention cleanup

- **Phase:** 5
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 47

## Checks
- [ ] Seed old + new screenshots; cleanup(N) removes only the old ones (rows + files).
- [ ] Returned deleted_count / bytes_freed are accurate.
- [ ] Set retention 7 days; wait for sweep (or force) → old shots gone.
- [ ] Non-owner cleanup attempt → 403.
- [ ] Another business's files untouched.
