# 44 — QA: screenshot upload

- **Phase:** 5
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 43

## Checks
- [ ] Upload a WebP → file appears under correct dated path; row created.
- [ ] Re-upload same uuid → no duplicate row; file intact.
- [ ] Upload >200 KB → rejected, nothing on disk.
- [ ] Crafted traversal filename can't write outside storage root.
