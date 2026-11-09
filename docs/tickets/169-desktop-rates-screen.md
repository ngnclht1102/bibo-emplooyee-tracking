# 169 — Rates on the desktop admin (per-person hourly rate)

**Date:** 2026-11-09 · **Status: Implemented on `release/v1.7.3`** ·
builds on [157](157-billing.md), [158](158-billing-enhancement.md), [167](167-project-rate-override.md)

## What changed and why

Setting a person's hourly rate was **web-admin only**. The desktop app already had the rest
of the owner's billing surface — Projects, Tasks & time, Invoices — so an owner working in
the app could create projects, watch time land, and generate invoices, but had to open a
browser for the one number that makes those invoices add up. Worse, people with no rate are
exactly what the invoice draft complains about, so the app could show you the problem and
not let you fix it.

The desktop admin section now has a **Rates** screen with the same model as the web page:

- every member with their current rate and the day it took effect
- "No rate" called out, so the gap the invoice draft complains about is visible here too
- a dialog to set the rate from a chosen day, with the full history and a way to delete a
  wrong entry

### Decisions

- **No backend or Rust work was needed.** The native billing screens already go through one
  generic passthrough command restricted to `/v1/businesses/{id}/billing/…`, and it allows
  nested paths (the Tasks screen already uses `tasks/{id}`). So this is a frontend screen
  plus three calls on the existing API wrapper — the backend re-checks workspace ownership
  exactly as before.
- **A member's first rate is backdated** to `2000-01-01` rather than today, matching the web
  page: otherwise time already logged before the rate existed would stay unrated and keep
  showing up as missing on the invoice draft. Subsequent changes default to today.
- **Currency and the invoice "from" details stay web-only.** They are one-off workspace
  setup, not day-to-day work, and putting a currency switcher next to live rates invites an
  accident. The screen reads the currency to format and label the amounts.
- **The rate shown is the one in force today** — the newest entry dated at or before today,
  not simply the newest row — so a future-dated raise doesn't misreport the current rate.

## Still not supported

A rate per *(project, person)* pair, as noted on [167](167-project-rate-override.md). One
rate per person plus one flat project rate is still the whole model.

## Verification

`tsc --noEmit` and `vite build` clean on the desktop app; all 7 locale catalogs at full key
parity for the new `admin.rates.*` and `nav.BillingRates` keys. The set/delete payloads were
checked against the backend handler. The screen has not yet been clicked through in a running
app — worth a pass alongside the [168](168-member-edit-remove.md) dialog.
