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
