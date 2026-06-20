# 91 — QA: extension install guide

- **Phase:** 7
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 90

## Checks
- [ ] With no extension installed, the Browser screen shows the install guide,
      placeholder, numbered steps, and "Waiting…" status.
- [ ] Install + pair the extension → status flips to "Connected" and the guide is
      replaced by the activity table.
- [ ] "Coming soon: Edge · Firefox · Safari" present; only Chrome marked supported.
- [ ] Uninstalling/stopping the extension returns the guide (re-discovery works).
