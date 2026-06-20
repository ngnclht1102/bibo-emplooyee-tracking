# 30 — Settings screen

- **Phase:** 4
- **Type:** Implementation
- **Status:** Blocked
- **Blocked by:** 3, 11, 19, 23
- **Blocks:** 31

## Goal
A single Settings screen consolidating all configuration, per the design prompt.

## Scope
- **Theme:** Light / Dark / System (segmented; default System).
- **Capture intervals:** screenshot frequency; **idle threshold** (default 60s).
- **Retention:** screenshot max age / max size (task 29).
- **Permissions:** link to the Permissions screen (task 15).
- **Privacy:** store-domain-only vs full URL; deny-list of domains.
- **Browser:** show active ingest port + shared token status.
- **Export:** CSV / JSON buttons.
- **Pause/Resume tracking.**
- Persist settings (config file or a `settings` table); trackers read them live.

## Acceptance criteria
- [ ] Every setting persists across restarts and takes effect without code changes.
- [ ] Changing idle threshold / intervals actually changes tracker behavior live.
- [ ] Domain-only + deny-list affect what `browser_visit` stores/shows.
- [ ] Flat, grouped layout; correct in both themes.
