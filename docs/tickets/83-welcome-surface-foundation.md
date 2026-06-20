# 83 — Welcome-surface foundation (shared assets & design)

- **Phase:** 7
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** —
- **Blocks:** 84, 85, 87, 88, 90

## Goal
Make the logo, the sanctioned light gradient, and small gamification primitives
available to both web-admin and desktop, and document the flat-rule exception.
See [docs/14-signup-and-onboarding.md](../14-signup-and-onboarding.md) and
[docs/07-ui-design.md](../07-ui-design.md).

## Scope
- Copy logo lockups + mark (light/dark) from `marketing/logo/` into
  `apps/web-admin/src/assets/` and `apps/desktop/src/assets/`.
- Add welcome-surface CSS to each app's `theme.css`: a `--welcome-gradient` token
  (`--accent-weak` → `--bg`, top→bottom) and an `.auth-card` / `.welcome` layout
  class. Dashboards untouched — gradient only on welcome screens.
- Add reusable components to each app's `ui.tsx`:
  - `StepDots` — `●──○──○` progress (props: total, current).
  - `SuccessBurst` — completion checklist + light celebratory state; respects
    `prefers-reduced-motion`.
- Note the welcome-surface exception in `docs/14-signup-and-onboarding.md` (done)
  and cross-reference from `docs/07-ui-design.md`.

## Acceptance criteria
- [ ] Logo renders crisp in light and dark on both apps.
- [ ] `--welcome-gradient` + `.auth-card` available; dashboards show no gradient.
- [ ] `StepDots` and `SuccessBurst` render from tokens only (no raw hex), reduced-
      motion honored.
- [ ] No new accent colors introduced.
