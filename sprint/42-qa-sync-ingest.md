# 42 — QA: sync ingest

- **Phase:** 5
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 41

## Checks
- [ ] POST a batch; rows land with correct user_id/business_id.
- [ ] Re-POST identical batch → row count unchanged (idempotent).
- [ ] Re-POST with a changed duration for same client_uuid → value updated.
- [ ] Body claiming a different user_id is ignored (token wins).
- [ ] Accepted-uuids response matches what was sent.
