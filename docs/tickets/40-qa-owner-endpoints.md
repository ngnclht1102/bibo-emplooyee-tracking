# 40 — QA: owner endpoints

- **Phase:** 5
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 39

## Checks
- [ ] Create business → shows in `/mine`.
- [ ] Create employee with no business → auto-business created; employee logs in.
- [ ] Owner A cannot touch owner B's business/employees (403).
- [ ] Duplicate employee email rejected.
- [ ] Set retention to 30 then Never; both persist.
