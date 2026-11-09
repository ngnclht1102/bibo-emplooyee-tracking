# 160 — Desktop: What's new page in the sidebar + Send feedback

**Date:** 2026-10-29 · **Status: Implemented (local only, not deployed)** ·
builds on [145](145-in-app-messages.md)

## What changed and why

145 bundled the release notes in the app and showed them **once**, as a popup, on the first
launch after an update. There was no way back to them: miss the popup, or want to re-read
what changed two versions ago, and the notes were gone. There was also no way for a user to
write back to us from inside the app — the only contact route was the marketing site.

This adds one sidebar entry, **What's new**, in the app group next to Settings. The page is
the full release-note history plus a **Send feedback** form at the bottom.

Decisions settled before the work (BossBrian):

- **One page, two sections** — not two nav entries. What's new is the page; feedback is the
  card at the bottom of it.
- **Feedback is stored in our own backend** (new table) and read in web-admin's super-admin
  area, so there's history and search. Not a Telegram ping, not a `mailto:` link.
- **Anyone can send it, including personal mode** — so the endpoint is public, and
  therefore rate-limited.

## The page (desktop)

Release notes come from the same bundled `WHATS_NEW` list the popup uses, so the page works
**offline and in personal mode**; it just renders every version instead of the newest one.
Versions sort newest-first numerically (not lexically, so `1.10.0` beats `1.9.0`), the
installed one is badged, and each entry falls back to English when the active locale has no
translation — identical to the popup's behaviour.

The feedback form collects a type (**broken / idea / question / other**), the message, and an
optional e-mail for a reply, prefilled with the signed-in account's address. Version,
platform and locale ride along automatically so a report can be placed without asking.
Nothing about the popup, the once-per-version logic, or `bibo.whatsNewSeen` changed.

Writing the notes themselves is unchanged: skill `bibotracker-whatnews-generate`, before the
release is built.

## Backend

`POST /v1/feedback` — **public**, since a personal-mode app has no account and its users
still need a way to write in. Two guards:

- `middleware.FeedbackRateLimit()` — per client IP, ~1 every 20 s with a burst of 3. Enough
  for a person to send and correct a message; not enough to flood the table.
- `auth.Optional()` (new) — a valid bearer token sets the caller's user id, a missing or
  invalid one is simply ignored. So a signed-in user's feedback is linked to their account,
  and everyone else's is still accepted.

The handler validates `kind` against the four allowed values, requires a non-empty message,
and truncates every client string (message to 4000 chars) before insert.

`GET /v1/admin/feedback?limit&offset` — super-admin only (same `SUPER_ADMINS` gate as the
Messages area), newest first, with the total so the page can page.

Migration `00016_feedback.sql` adds `feedback`: `user_id` (nullable, `ON DELETE SET NULL`),
`email`, `kind` (CHECK), `message`, `app_version`, `platform`, `locale`, `created_at`, plus a
`created_at DESC` index.

## web-admin

New super-admin page **Internal → Feedback** (`/internal/feedback`): read-only table of
when / from / type / message / app build. Rows with no account show "No account (personal
mode)". "Load more" pages through 100 at a time.

## i18n

All 7 locales (`en, vi, zh, ja, id, fr, es`): desktop `common.json` gains `nav.WhatsNew`,
`whatsNew.*` and `feedback.*`; web-admin gains `nav.feedback` and `dashboard.feedback.*`.

## Files

- `apps/backend/internal/db/migrations/00016_feedback.sql` (new)
- `apps/backend/internal/store/feedback.go` (new)
- `apps/backend/internal/handlers/feedback.go` (new)
- `apps/backend/internal/auth/middleware.go` — `Optional()`
- `apps/backend/internal/middleware/ratelimit.go` — `FeedbackRateLimit()`
- `apps/backend/internal/server/server.go` — the two routes
- `apps/desktop/src-tauri/src/sync/client.rs` — `submit_feedback` (free fn, like `fetch_privacy_apps`)
- `apps/desktop/src-tauri/src/commands/mod.rs`, `lib.rs` — `feedback_submit` command
- `apps/desktop/src/screens/WhatsNew.tsx` (new), `App.tsx`, `theme.css`, 7× `common.json`
- `apps/web-admin/src/pages/internal/Feedback.tsx` (new), `App.tsx`, `AppShell.tsx`,
  `api/endpoints.ts`, `api/types.ts`, `theme/theme.css`, 7× `common.json` + `dashboard.json`

## Verified

`go build ./...` + `go vet ./...`, `cargo check`, and `tsc --noEmit` + `vite build` for both
desktop and web-admin all pass. The migration and the end-to-end submit have **not** been run
against a database yet — that is the QA step.
