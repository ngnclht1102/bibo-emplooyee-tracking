# 94 — UX v2 foundation: member-terms helper + ProgressRail

- **Phase:** 7
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** —
- **Blocks:** 95, 97, 99

## Goal
Shared primitives for the persona-onboarding UX v2: a member-terminology helper
driven by `business.kind`, and a reusable two-column **progress rail** component.
See [docs/14-signup-and-onboarding.md](../14-signup-and-onboarding.md) (UX v2).

## Scope
- **Web `Business.kind`:** add `kind: "team" | "family"` to the `Business` interface
  in `apps/web-admin/src/api/types.ts` (the backend already returns it on
  `GET /v1/businesses/mine` and `/policy` — no backend change).
- **`memberTerms(kind)` helper** (`apps/web-admin/src/format.ts` or a new
  `terms.ts`):
  - `team`   → `{ one: "Employee", many: "Employees", addCta: "Add employee" }`
  - `family` → `{ one: "Kid", many: "Kids", addCta: "Add kid" }`
  - Defaults to `team` when kind is missing/undefined.
- **`ProgressRail` component** added to **both** `apps/web-admin/src/components/ui.tsx`
  and `apps/desktop/src/ui.tsx`:
  - Props: `steps: { title: string; description: string }[]`, `current` (1-based).
  - Renders a vertical list: done = green ✓ circle, current = accent ringed number,
    upcoming = grey number; titles bold, descriptions muted; connector line between.
  - Collapses to the existing horizontal `StepDots` under a narrow breakpoint.
- **CSS** for the rail + two-column welcome layout in each app's stylesheet
  (`.welcome-split`, `.progress-rail`, `.rail-step` …), tokens only. The content
  card is **transparent** and the rail panel is **translucent glass** — see the
  app-wide background treatment in task 101 (don't introduce opaque card fills).

```
●✓  Choose account type          ← done   (green ✓)
│    Personal, team or family
④   Name your team               ← current (accent ring)
│    What to call your team
⑤   Add employees                ← upcoming (grey)
     Invite the people you manage
```

## Acceptance criteria
- [ ] `useBusinesses().selected?.kind` is typed and available to components.
- [ ] `memberTerms("family").many === "Kids"`, `memberTerms("team").many === "Employees"`,
      `memberTerms(undefined)` falls back to team.
- [ ] `ProgressRail` renders done/current/upcoming markers from `current`; matches
      the rail in the mockup; tokens only (no raw hex); reduced-motion safe.
- [ ] Rail collapses to `StepDots` on narrow widths.
- [ ] Both apps typecheck/build.
