# 150 — Web-admin sidebar: labelled, grouped, like the desktop app

**Date:** 2026-10-10 · **Status: Done (not deployed)**

## Why
The web-admin left nav was an icon-only rail (labels only on hover) — hard to scan and
inconsistent with the desktop app's sidebar.

## What
Rebuilt to mirror the desktop sidebar (apps/desktop App.tsx `.sidebar`):
- Brand tile + "BiBoTracking" wordmark (Bo accent) + "Admin dashboard" sub-line.
- Labelled groups: **Workspace** (Dashboard, Members) · **Internal** (Overview, Messages —
  super admins only) · Settings pinned to the bottom behind a divider.
- Items are icon + label pills; active = brand gradient pill (same as desktop).
- Account box at the foot (login + Sign out), like the desktop.
- ≤ 860 px: collapses back to the 76 px icon rail with hover labels.
- New `admin-side*` classes replace `admin-rail*`/`admin-railbtn*` (tokens only);
  `nav.group.workspace|internal` + `nav.adminSub` in all 7 locales.

## Verified
Light, dark, collapsed (700 px); super admin sees the Internal group, a normal owner
doesn't. web-admin `tsc --noEmit` + `vite build` pass.
