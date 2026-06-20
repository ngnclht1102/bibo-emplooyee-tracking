# 82 — QA: persona model + register

- **Phase:** 7
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 81

## Checks
- [ ] Register a manager and a parent; DB shows correct `account_type` and business
      `kind` for each.
- [ ] `GET /v1/me` returns the right `account_type`; `/v1/businesses/mine` the right
      `kind`.
- [ ] Invalid `account_type` is rejected (400) with nothing written.
- [ ] Migration up then down leaves the schema consistent; pre-existing owners
      still load and default sanely.
- [ ] Creating an employee/kid under a parent business still succeeds.
