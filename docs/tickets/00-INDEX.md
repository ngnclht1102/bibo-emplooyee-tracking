# Sprint — task index

One task per file, numbered in execution order. Every implementation task is followed
by an **interactive QA** task (a human runs the app and confirms behavior — not just
automated tests). Tasks marked **Blocked** must not be started until their
dependencies are **Done**.

## Conventions

- **Status:** `Ready` (can start now) · `Blocked` (waiting on a dependency) · `Done`.
- **Type:** `Implementation` · `QA (interactive)`.
- **Blocked by / Blocks:** task numbers. Keep these honest — flip a Blocked task to
  Ready only when everything it's blocked by is Done.
- A QA task failing **blocks** the next task; loop back and fix before proceeding.

## Order

### Phase 1 — Core skeleton
1. Project scaffold (Tauri v2 + React + TS) — **Ready**
2. QA: project scaffold — Blocked by 1
3. Design system & theming (tokens, dark/light/system) — Blocked by 1
4. QA: theming — Blocked by 3
5. SQLite storage layer + migrations — Blocked by 1
6. QA: storage layer — Blocked by 5
7. Active-time tracking (active window + idle, active-only) — Blocked by 5
8. QA: active-time tracking — Blocked by 7
9. Dashboard UI (stat cards, timeline, app breakdown) — Blocked by 3, 7
10. QA: dashboard — Blocked by 9
11. CSV export — Blocked by 5
12. QA: CSV export — Blocked by 11

### Phase 2 — Keyboard + screenshots
13. Permission status checks + Tauri commands — Blocked by 1
14. QA: permission checks — Blocked by 13
15. Permissions screen UI — Blocked by 3, 13
16. QA: permissions screen — Blocked by 15
17. Keyboard counter (counts only) — Blocked by 5, 13
18. QA: keyboard counter — Blocked by 17
19. Screenshot capture — Blocked by 5, 13
20. QA: screenshots — Blocked by 19
21. Activity & gallery UI (keyboard chart + screenshot gallery) — Blocked by 3, 17, 19
22. QA: activity & gallery UI — Blocked by 21

### Phase 3 — Browser extension
23. Local ingest server + port fallback (axum /whoami /ingest) — Blocked by 5
24. QA: ingest server — Blocked by 23
25. Browser extension (tab tracking + port auto-discovery) — Blocked by 23
26. QA: browser extension end-to-end — Blocked by 25
27. Browser activity UI — Blocked by 3, 23, 25
28. QA: browser activity UI — Blocked by 27

### Phase 4 — Polish
29. Screenshot retention / cleanup — Blocked by 19
30. Settings screen (theme, intervals, idle threshold, privacy, export) — Blocked by 3, 11, 19, 23
31. QA: settings — Blocked by 30
32. JSON export + date-range filters — Blocked by 11
33. Final full QA regression pass — Blocked by all above

### Phase 5 — Backend, sync & web admin
See [docs/11-backend-and-sync.md](../11-backend-and-sync.md).

35. Backend scaffold (Go + Gin + pgx + goose, config, health) — **Done**
36. QA: backend scaffold — Blocked by 35
37. Auth + tenant model (users/businesses/memberships, argon2, JWT, public picker, login/refresh) — **Done**
38. QA: auth & tenant model — **Ready**
39. Owner endpoints (create business, create employee + auto-business, lists, settings) — **Done**
40. QA: owner endpoints — **Ready**
41. Sync ingest endpoints (activity/keystrokes/browser batch, idempotent upsert by client_uuid) — **Done**
42. QA: sync ingest — **Ready**
43. Screenshot upload endpoint (multipart, filestore, ≤50KB guard) — **Done**
44. QA: screenshot upload — **Ready**
45. Reporting read APIs (roster, activity, keystrokes, browser, screenshots, auth-gated image serving) — **Ready**
46. QA: reporting APIs — Blocked by 45
47. Screenshot retention cleanup (per-business setting, manual + scheduled sweep) — **Done**
48. QA: retention cleanup — **Ready**
49. Desktop: local schema migration v2 (client_uuid, synced, updated_at + partial index) — **Done**
50. QA: local migration v2 — **Ready**
51. Desktop: auth/session (login call + keychain token storage) — **Done**
52. QA: desktop auth — **Ready**
53. Desktop: sync worker (batched, network-aware, mark synced, backoff) — **Done**
54. QA: sync worker end-to-end — Blocked by 53
55. Desktop: WebP screenshot compression ≤50KB at capture — **Done**
56. QA: screenshot compression — **Ready**
57. Desktop: employee login picker UI — **Done**
58. QA: login picker — **Ready**
59. Web admin scaffold (apps/web-admin React + Vite, design tokens, auth) — **Done**
60. QA: web admin scaffold — Blocked by 59
61. Web admin: business & employee management UI — **Done**
62. QA: business/employee management — Blocked by 61
63. Web admin: reporting dashboards (timeline, breakdown, keystrokes, screenshot gallery) — **Done**
64. QA: reporting dashboards — Blocked by 63
65. Web admin: screenshot retention controls (set days + clean up now) — **Done**
66. QA: retention controls — **Ready**
67. Final Phase 5 QA regression — Blocked by all above

### Phase 6 — Windows support
See [docs/12-windows-support-plan.md](../12-windows-support-plan.md) (port plan + build
machine) and [docs/13-windows-support-ticket.md](../13-windows-support-ticket.md) (tracker).
Milestone mapping: M1=68 · M2=69–70 · M3=71–73 · M4=74–76 · M5=77–78 · M6=79.

68. M1: Windows platform abstraction + skeleton (cfg split, getrandom, idle) — **Done**
69. M2: Windows keyboard counter (WH_KEYBOARD_LL, counts only) — **Done** (compiles on Win; QA 70)
70. QA: Windows keyboard counter — **Ready** (needs interactive run)
71. M3a: Data-driven permissions/consent model (Rust) — **Done**
72. M3b: First-run consent + Settings opt-outs (React) — **Done** (typechecks; QA 73)
73. QA: Windows consent + opt-outs — **Ready** (needs interactive run)
74. M4a: Windows build + NSIS installer (build-desktop-exe skill) — **Done (unsigned)** (employeetrack_1.0.1_x64-setup.exe, 4.1 MB; skill written)
75. M4b: Authenticode code signing — Blocked by 74 · **needs decision** (Azure/OV/EV §7.2)
76. QA: Windows installer + SmartScreen — Blocked by 75
77. M5: Windows download + marketing/SEO + deploy — Blocked by 74
78. QA: Windows download page — Blocked by 77
79. M6: Windows QA matrix & alpha — Blocked by 70, 73, 76, 78
