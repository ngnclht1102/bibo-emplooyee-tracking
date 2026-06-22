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

### Phase 7 — Signup, personas & onboarding
See [docs/14-signup-and-onboarding.md](../14-signup-and-onboarding.md). Three personas
(personal = local-only/no account · manager = team · parent = family), revamped
signup/signin with logo + light gradient + wizard, desktop first-run onboarding, and
a Chrome-extension install guide.

80. Persona data model (backend: users.account_type, businesses.kind) — **Done**
81. Register + business setup by persona — **Done**
82. QA: persona model + register — **Ready** (needs DB run)
83. Welcome-surface foundation (logo, gradient token, StepDots/SuccessBurst) — **Done**
84. Web auth shell + sign-in revamp — **Done**
85. Web signup wizard (persona) — **Done**
86. QA: web signup + signin — **Ready** (needs interactive run)
87. Desktop login revamp + signup link + personal branch — **Done**
88. Desktop first-run onboarding flow — **Done**
89. QA: desktop onboarding (macOS + Windows) — **Ready** (needs interactive run)
90. Browser extension install guide — **Done**
91. QA: extension install guide — **Ready** (needs interactive run)
92. Phase 7 regression QA — Blocked by 86, 89, 91

### Phase 8 — Low-cost production deployment
Ship production on a cheap single VPS (Go backend + Postgres + Cloudflare Tunnel),
keeping disk bounded so the box holds many machines on the small SSD.

93. Hard screenshot retention cap (backend, 3-day ceiling) — **Ready**

### Phase 7 (cont.) — Persona onboarding UX v2
See [docs/14-signup-and-onboarding.md](../14-signup-and-onboarding.md) (UX v2).
Two-column progress-rail layout (per reference image) for the web wizard + desktop
onboarding, an add-employees/add-kids step during web signup, and persona wording
("Kids" vs "Employees") across the dashboard.

94. UX v2 foundation: member-terms helper + ProgressRail component — **Done**
95. Web: persona terminology across the dashboard — **Done**
96. QA: web persona terminology — **Ready** (needs interactive run)
97. Web signup wizard: rail layout + add-members step — **Done**
98. QA: web wizard rail + add-members — **Ready** (needs interactive run)
99. Desktop onboarding: rail redesign — **Done**
100. QA: desktop onboarding rail — **Ready** (needs interactive run)
101. App-wide signature background + translucent surfaces (web + desktop) — **Done**
102. QA: signature background — **Ready** (needs interactive run)
103. Onboarding & auth polish ("Set up again", drop GIF placeholder, unified nav) — **Done**
104. Member login by username (not only email) — **Done**
105. Owner self-tracking (owner shows in own dashboard) — **Done**

### Phase 9 — Internationalization (multi-language)
Localize the product into 6 high-population markets (English base + Simplified
Chinese, Japanese, Vietnamese, Bahasa Indonesia, French, Spanish) across the web
admin, desktop app, and marketing home page — with native-quality, reviewed
translations and a shared glossary. See [106](106-i18n-foundation.md) for the locale
list, framework, and translation quality bar.

106. i18n foundation & locale framework (web + desktop) — **Done**
107. Web admin: externalize strings + translate — **Done**
108. Desktop app: externalize strings + translate (incl. native/Rust) — **Done**
109. Marketing home page: localized variants + SEO — **Done**
110. QA: i18n across web/desktop/marketing (native review) — **Ready** (107–109 done)
111. Rebrand display name → "BiBoTracking" (display only) — **Done**
112. Three environments (local/staging/production) for admin + desktop — **Done**
113. Per-env Postgres DB + distinct desktop identity (id/ribbon) + launch scripts — **Done**
114. Production provisioned on bibotracker.com (Ubuntu VPS, Cloudflare Tunnel; domain corrected) — **Done**
115. Marketing home page: per-env build (prod SEO/GA + i18n switcher/asset fixes) — **Done**
116. Marketing: persona content (solo/team/family) + flag language switcher — **Done**
117. Flag language switcher in web admin + desktop (onboarding & dashboard) — **Done**
118. Release 1.1.0: desktop builds (mac DMG + Windows MSI) + Windows download on marketing — **Done**
119. Marketing: cross-platform messaging (macOS + Windows) in SEO + visible copy, all 7 locales — **Done**

### Phase 10 — Extension upgrade + observability (Sentry & logging)
Rebrand the browser extension to "BiBo Tracker" (display only), surface the on/off
toggle as marker browser-page events through the desktop → backend, route extension
errors to Sentry via the desktop app, wire Sentry into all four runtimes (Go backend,
web admin, desktop Rust + UI), and add a shared log util with network-call logging. All
Sentry DSNs are env-driven — empty DSN ⇒ disabled, so local dev stays quiet.

120. Extension rebrand → "BiBo Tracker" (display only) — **Done**
121. Extension on/off → marker browser-page events (`user_turn_off/on_in_browser`) — **Done**
122. Sentry: Go backend (sentry-go + sentrygin, env DSN) — **Done**
123. Sentry: web-admin (@sentry/react, VITE_SENTRY_DSN) — **Done**
124. Sentry: desktop (Rust core + React UI, separate projects) — **Done**
125. Extension error reporting → desktop `/report-error` → Sentry — **Done**
126. Logging strategy: shared log util (console + Sentry) + network-call logging — **Done**

### Phase 11 — Observability ops, analytics, auto-update + releases
Make the desktop product operable + self-updating in production: Sentry restricted to
prod, installer download counter, crash-free app-open analytics (Aptabase direct API),
signed self-hosted **auto-update** (MSI download / NSIS silent updates), extension
packaged for the Web Store, and three production releases (1.2.0 → 1.3.0 → 1.3.1).

127. Observability hardening + analytics + auto-update + 1.2.0→1.3.1 releases — **Done**
128. Aptabase analytics: plugin crash (raw tokio::spawn) + direct-API workaround — **Done**
129. Analytics accuracy: device-id session (true DAU) + shared client + offline queue — **Done**
130. Desktop Settings: show installed app version (getVersion) — **Done**
131. Update UX: silent Windows install + check-on-focus + restart-on-confirm — **Done**
132. Show app version under the sidebar brand (BiBoTracking vX.Y.Z) — **Done**
133. Analytics: app_active (focus) + ui_click (menu/button) events to Aptabase — **Done**
134. Fix: app_active never fired — move to native Rust WindowEvent::Focused — **Done**
135. Aptabase: 1.3.x direct-API events not landing — **Open** (paused, resume 2026-06-23)
