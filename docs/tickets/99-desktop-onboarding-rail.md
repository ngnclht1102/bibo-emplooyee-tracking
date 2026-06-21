# 99 — Desktop onboarding: rail redesign

- **Phase:** 7
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** 94
- **Blocks:** 100

## Goal
Bring the desktop first-run onboarding to visual parity with the web wizard: the
same two-column **progress-rail** layout (per the reference image), keeping the
existing persona-aware content. See
[docs/14-signup-and-onboarding.md](../14-signup-and-onboarding.md) (UX v2 §1).

## Layout (D3′–D5′)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ left: content on welcome gradient            │ right: ProgressRail              │
│                                              │                                  │
│   ◆ BiBoTracking                     │   ④   What it does               │
│                                              │   │    What we record on this Mac │
│   👋 What BiBoTracking does           │   ⑤   What you can turn off       │
│   • Foreground app & time                    │   │    Your privacy controls      │
│   • Keypress counts only (never the keys)    │   ⑥   Enable permissions          │
│   • Periodic screenshots                     │        Grant & finish             │
│   • Web pages (with the extension)           │                                  │
│   <persona line: personal / employee / kid>  │                                  │
│              [ Skip ]        [ Next → ]       │                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

Three rail steps: **What it does · What you can turn off · Enable permissions**
(the existing D3/D4/D5 content). No add-members step here — the desktop is the
employee/kid's own device; members are added on the web (task 97).

## Scope
- Rewrite `apps/desktop/src/screens/Onboarding.tsx` to use `ProgressRail` (task 94)
  in a two-column `welcome-split` layout instead of the top `StepDots`.
- Keep the persona derivation (`local_only` → personal; policy `family` → kid) and
  all current content: persona "who sees this" line, the turn-off toggles with the
  org-lock behaviour, and the embedded `Permissions` rows + GIF placeholder slot.
- Windows still shows its consent/capture variant in step 3.

## Acceptance criteria
- [ ] Onboarding shows the two-column rail; markers advance per step; matches mockup.
- [ ] Persona copy and locked toggles behave exactly as before (no regression).
- [ ] Step 3 still embeds live permission rows + the platform-aware GIF slot.
- [ ] Finish marks `onboarding_completed` and lands on the dashboard.
- [ ] Narrow window collapses the rail to `StepDots`; desktop builds.
