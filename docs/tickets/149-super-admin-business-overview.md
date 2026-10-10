# 149 — Super-admin Business overview (growth, DAU/MAU, retention, churn)

**Date:** 2026-10-10 · **Status: Done — deployed to prod 2026-10-10**

## Goal
One web-admin page, super admins only, that answers: are we growing, are people using it,
does it stick after signup, who is leaving, and how deeply it's used. Backend + web-admin
only — **no desktop change** (Phase 3 items that need app data are out of scope).

## Definitions (agreed with BossBrian 2026-10-10)
- **Customer = workspace** (business). People = users with tracked activity.
- **Day** = UTC calendar day of the activity sample.
- **Active person (day)** = ≥ 5 min of synced activity that day (any workspace).
- **Active workspace (day)** = ≥ 1 active person that day.
- **DAU / WAU / MAU** = distinct active people on the day / 7 / 30 days ending that day.
  Stickiness = DAU ÷ MAU.
- **Activated workspace** = first active day within 7 days of creation.
- **At risk** = workspace last active 7–13 days ago. **Churned** = was active, silent ≥ 14 days.
- Owner-only workspaces (nobody tracked) do **not** count as active.
- Personal-mode (no account) users never reach the server — not counted; the page says so.

## Data
- New table `activity_days(day, user_id, business_id, active_s)` — daily rollup of
  `activity_samples` (6.2M rows / 2.3 GB on prod, too big to aggregate per request).
- Background refresher (`internal/rollup`): **full rebuild** on startup and every hour.
  Measured on prod data: full rebuild 2.6 s → ~2,500 rows; a 7-day partial refresh was
  still 1.4 s, so full rebuild wins (simpler, and late syncs from offline devices are
  picked up for free). Readers see the old rows until the rebuild commits.

## Page (web-admin → Overview, super admin only)
Built from the existing design system (bibo-card / bibo-stat / admin-panel / admin-appbars /
admin-table / bibo-seg, theme tokens only):
- KPI cards: MAU (focal), DAU, stickiness, new sign-ups (30 d) · active workspaces,
  at-risk, churned, avg tracked hours per active person.
- Trend chart (30 / 90 / 180 d): DAU, WAU, MAU, new sign-ups, active workspaces.
- Activation funnel (workspaces created in range): created → first data → 2+ people →
  active in week 2.
- How often people use it: active-days-in-last-30 buckets.
- Weekly retention cohorts (workspace signup week × weeks 1–8).
- At-risk / churned workspace list (name, type, owner, people, last active).

## API
`GET /v1/admin/overview?days=30|90|180` (super admin only).

## Privacy
Counts and workspace-level rows only — never window titles, URLs or screenshots.

## Design-system additions (theme.css, "business overview" section, tokens only)
Area chart (`admin-trend*`), wide bar labels (`admin-appbars--wide`), in-card tables
(`admin-tablecard--flat`, `admin-table--grid`), retention heat cell (`admin-heat`),
status pill (`admin-pill--warn/--neg`), workspace name row (`admin-wsname`). Everything
else reuses existing classes. The workspace picker is hidden on this page.

## Verified (2026-10-10)
- Queries run against real prod data read-only (temp table over an SSH tunnel):
  ~1 s per request. Prod snapshot: DAU 70, WAU 104, MAU 191, stickiness 37 %,
  73 active workspaces (30 d), 12 at risk, 46 churned; funnel 117 created → 66 first data
  → 65 activated → 24 week-2 → 19 with 2+ people.
- Local e2e on a throwaway Postgres with synthetic data: API 200 for 30/90/180,
  400 for other ranges, 401 without token, 403 for non-super-admins; page checked in
  light, dark and 390 px phone width; all 67 strings present in 7 locales.
- `go build` / `go vet`, web-admin `tsc --noEmit` + `vite build` pass.

## Deploy notes
New migration `00012_activity_days` (additive — new table only; backout = swap the binary
back, no DB restore). First rebuild runs at startup in the background (~3 s).
