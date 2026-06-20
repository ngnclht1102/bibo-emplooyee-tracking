# 88 — Desktop first-run onboarding flow

- **Phase:** 7
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** 83, 87
- **Blocks:** 89

## Goal
Persona-aware first-run onboarding (mockups **D3–D5**).

```
●──○──○ D3 What it does          ●──●──○ D4 What you can turn off
 • foreground app & time          Screenshots        [ ●— on ]
 • keypress COUNTS only           Keypress counting  [ ●— on ]
 • periodic screenshots           Browser tracking   [ —● off]  (🔒 owner-managed)
 • web pages (extension)          Domain-only URLs   [ —● off]
 <persona line: personal/         ⓘ employee: locked rows are team-managed
  employee/kid>

●──●──● D5 Enable permissions (macOS shown; Windows swaps rows/gif)
 ┌ [ GIF placeholder ] ┐  Accessibility    ▲ Open
 │ toggle in Settings  │  Input Monitoring ▲ Open
 └─────────────────────┘  Screen Recording ✓ Done    [ Finish ✓ ]
```

## Scope
- New `apps/desktop/src/screens/Onboarding.tsx`, 3 steps with `StepDots`, gated on
  a local `onboarding_completed` setting; also reachable from Settings later.
- **Step 1 (D3):** persona-aware copy. Persona derived from `local_only` (personal)
  vs the logged-in membership (`owner`→manager, `employee`→employee/kid; for a
  `family` business an employee is shown the "kid" copy).
- **Step 2 (D4):** toggles reusing the org-policy lock (`apply_org_policy`,
  `AppSettings`): personal = all free; employee = owner-managed rows shown locked
  🔒; kid = minimal.
- **Step 3 (D5):** embed the existing `Permissions.tsx` rows + deep-links, plus a
  platform-aware **GIF placeholder slot** (macOS TCC vs Windows consent/capture).
- On finish: set `onboarding_completed`, route to dashboard.

## Acceptance criteria
- [ ] Onboarding shows once (after first login / local-only choice) and not again.
- [ ] Step 1 copy matches persona (personal / employee / kid).
- [ ] Step 2 toggles writable for personal; owner-managed rows locked for employees.
- [ ] Step 3 reflects real permission status and updates live; GIF slot present.
- [ ] Windows shows its consent/capture variant rather than macOS rows.
- [ ] Finish marks complete and lands on the dashboard.
