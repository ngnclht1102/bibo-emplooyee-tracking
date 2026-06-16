# 67 — Final Phase 5 QA regression

- **Phase:** 5
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 35–66

## Goal
End-to-end pass over the whole backend + sync + web admin flow.

## Checks
- [ ] Owner signs up, creates a business, adds an employee (and the auto-business path).
- [ ] Employee logs in on desktop; tracking runs offline; data syncs when online.
- [ ] One-directional flow holds: extension → desktop → backend; nothing flows back.
- [ ] Re-sync / crash recovery produces no duplicates (idempotent by client_uuid).
- [ ] Conflicts resolve to the local copy.
- [ ] Screenshots are ≤50 KB end-to-end; gallery + enlarge work in web admin.
- [ ] Retention: manual + scheduled cleanup remove rows + files; un-synced local data safe.
- [ ] Cross-business isolation holds across every endpoint.
- [ ] No plaintext secrets; tokens in Keychain (desktop); HTTPS assumptions documented.
