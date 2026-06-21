# 97 — Web signup wizard: rail layout + add-members step

- **Phase:** 7
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** 94
- **Blocks:** 98

## Goal
Redesign the signup wizard into the two-column **progress-rail** layout (per the
reference image) and add an **Add employees / Add kids** step before finish.
See [docs/14-signup-and-onboarding.md](../14-signup-and-onboarding.md) (UX v2 §1–2).

## Layout (W2′ — team/family path)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ left: content on welcome gradient            │ right: ProgressRail (flat panel) │
│                                              │                                  │
│   ◆ BiBoTracking                     │   ●✓  Choose account type        │
│                                              │   │    Personal, team or family   │
│   Create your account                        │   ●✓  Create your account         │
│   Get the most out of BiBoTracking.  │   │    Name, email, password      │
│                                              │   ④   Name your team             │
│   ┌────────────────────────────────────────┐ │   │    What to call your team     │
│   │ Your name [ Jane Cooper            ]   │ │   ⑤   Add employees              │
│   │ Email     [ jane@cooper.co         ]  │ │   │    Invite the people you manage│
│   │ Password  [ ••••••••  (min 8)      ]  │ │   ⑥   All set                    │
│   └────────────────────────────────────────┘ │        Start tracking            │
│             [  Continue →  ]                  │                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Steps (team/family)
1. **Choose account type** — the three persona cards (W2).
2. **Create your account** — name / email / password → `register({account_type})`.
3. **Name your {team|family}** → `createBusiness`.
4. **Add {employees|kids}** — the add-members step (below). Optional → "Skip for now".
5. **All set** — `SuccessBurst`, checklist reflects how many members were added →
   "Go to dashboard".

Personal path is unchanged (download CTA, no rail / a minimal rail is fine).

## Add-members step (step 4)

```
   Add your employees                         (family → "Add your kids")
   Invite the people you manage. They'll sign in on the app with these details.

   Name             Email                Temp password
   [ Tom Lee     ]  [ tom@cooper.co   ]  [ ········ ]   [ + Add ]

   Added
    ✓ Tom Lee    tom@cooper.co                         [remove]
    ✓ Mia Lee    mia@cooper.co                         [remove]

        [ Skip for now ]                       [ Finish → ]
```

- Each `+ Add` calls `createEmployee({email, password, display_name})` against the
  owner's just-created business; on success the row moves into "Added".
- Inline errors per row (duplicate email, weak password) without losing the others.
- Labels (heading, button, helper) come from `memberTerms(persona)`.
- "Skip for now" and "Finish" both advance to step 5; finish summarises the count.

## Scope
- Rewrite `apps/web-admin/src/auth/SignupWizard.tsx` to drive `ProgressRail`
  (task 94) with the 5-step list; left column = current step's form.
- Reuse `AuthLayout` but in a `welcome-split` two-column variant.
- Wire `createEmployee` from `api/endpoints.ts`.

## Acceptance criteria
- [ ] Wizard shows the right-side rail with done ✓ / current / upcoming markers that
      advance as the user proceeds; matches the mockup.
- [ ] Add-members step adds multiple members (each a real `createEmployee` call),
      lists them, supports remove, and "Skip for now".
- [ ] Heading/button labels read employees vs kids by persona.
- [ ] Finish screen checklist reflects the actual number added.
- [ ] Personal path still works; layout responsive (rail → StepDots when narrow).
