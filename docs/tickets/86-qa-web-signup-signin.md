# 86 — QA: web signup + signin

- **Phase:** 7
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 85

## Checks
- [ ] Sign-in (W1) shows logo + gradient; valid/invalid creds behave correctly.
- [ ] Wizard Step 1: all three persona cards render with correct copy.
- [ ] Personal → download CTA (W3); confirm **no** `users` row was created.
- [ ] Manager → completes; DB shows `account_type=manager`, business `kind=team`;
      lands in dashboard.
- [ ] Parent → completes; `account_type=parent`, `kind=family`; labels say "family".
- [ ] Duplicate email + weak password show inline errors.
- [ ] Light + dark both legible; dashboard remains flat (no gradient).
