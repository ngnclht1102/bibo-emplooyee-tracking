# 165 — Feedback replies (CTR-39): super admin answers, the user is notified in the app

**Date:** 2026-11-07 · **Status: Released in 1.7.3 (2026-11-09)** ·
builds on [160](160-desktop-whatsnew-feedback.md)

## What changed and why

160 gave users a way to write to us from inside the app and gave us a place to read it —
but the conversation stopped there. Every message was a dead end: the super-admin Feedback
page was read-only, and a user who reported a bug or asked a question never heard back
unless someone emailed the contact address by hand (and most senders leave it blank).

CTR-39 closes the loop. A super admin can answer any submission from the web-admin Feedback
page, and the sender sees that answer in the desktop app — with a count on the sidebar so
they notice it the moment they open the app.

Decisions taken while implementing (no blocking questions were raised):

- **One reply per submission, editable** — not a thread. The feedback form is a way to
  write in, not a chat; a single answer covers "fixed in 1.7.3" and "what OS are you on?".
  Rewriting the reply is allowed and **notifies the sender again**; clearing it withdraws it.
- **The notification lands in the desktop app**, which is where feedback is written and
  where the user already goes to read release notes. Web-admin is the owner's dashboard, not
  the sender's inbox.
- **Personal-mode submissions can't be answered.** They have no `user_id`, so there is no
  account to notify; those rows say so in the admin table instead of offering a reply box.

## Data model

`00019_feedback_reply.sql` adds four columns to `feedback`:

| column | meaning |
|---|---|
| `reply` | the super admin's answer; `''` = unanswered |
| `replied_at` | when it was last written |
| `replied_by` | which super admin wrote it (`ON DELETE SET NULL`) |
| `reply_seen_at` | when the sender last read it; `NULL` = unread |

"Unread" is `reply <> '' AND (reply_seen_at IS NULL OR reply_seen_at < replied_at)` — the
second half is what makes an **edited** reply notify again without a separate flag. A
partial index on `user_id WHERE reply <> ''` keeps the per-launch unread check cheap.

## API

| route | who | what |
|---|---|---|
| `POST /v1/admin/feedback/:id/reply` | super admin | write/rewrite the answer (max 4000 chars); 404 on an unknown id |
| `GET /v1/feedback/mine` | signed in | the caller's own submissions + replies + `unread` count |
| `POST /v1/feedback/mine/seen` | signed in | mark the caller's replies read |

`GET /v1/admin/feedback` now also returns `reply` and `replied_at` per row. The two
`/feedback/mine` routes are scoped to `user_id = caller` in SQL, so one user can never see
another's messages.

## web-admin (super admin → Feedback)

A **Reply** column. Unanswered rows show a "Reply" link; answered rows show the reply text,
when it was sent, and "Edit reply". Either opens an inline editor row under the submission
(textarea + Send/Cancel) — no modal, so the message being answered stays on screen. Saving
patches the row in place rather than refetching the page.

## Desktop (What's new & feedback)

- A **Your feedback** card above the release notes, shown only when signed in: each of the
  user's own messages, its reply (or "we haven't replied yet"), unread ones marked with an
  accent rule and a **New reply** pill.
- Opening the page marks the replies read — server-side and in the sidebar at once.
- A **count badge on the sidebar item**, fetched on launch and on every `app-focused` event
  (the same moments the in-app message popup re-checks), so a reply is visible without the
  user having to go looking for it.

Both surfaces are localized in all 7 locales.

## Verified

- Migration applies on top of 00001–00018 on a scratch Postgres; the four columns, the
  partial index and the `replied_by` FK are present.
- The reply / list / mark-seen / **edit-re-notifies** queries exercised directly in SQL —
  unread flips `true → false → true` across reply, seen, and edit.
- `go build ./...`, `go vet ./...`, `go test ./...` (all pass); web-admin and desktop
  `tsc --noEmit` + `vite build`; `cargo check` in `apps/desktop/src-tauri`.
- Not yet deployed, and not yet seen in a running app — the desktop half needs a release
  build to reach users.
