# 148 — Make `ngnclht` a super admin on production

**Date:** 2026-10-10 · **Status: Done** (env set + restarted 2026-10-10; backup `.env.bak-2026-10-10-pre-148`)

## Why
Super-admin pages (Messages from 145, Business overview from 149) are gated by the backend
`SUPER_ADMINS` env (comma-separated usernames/emails). It was never set on prod, so nobody
can open them. 145 noted the step but it wasn't done.

## What
- Add `SUPER_ADMINS=ngnclht` to `/opt/bibotracking/.env` on the Oracle prod box (back up
  `.env` first), restart `bibotracking`.
- `ngnclht` = BossBrian's prod account (username, created 2026-06-21).

## Verify
- Service healthy after restart.
- Log in as `ngnclht` → `/v1/me` returns `is_super_admin: true`; the super-admin nav items
  show in web-admin. Any other account still gets 403 on `/v1/admin/*`.

## Backout
Restore the `.env` backup (or remove the line) and restart.
