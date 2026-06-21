# 85 — Web signup wizard (persona)

- **Phase:** 7
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** 81, 83, 84
- **Blocks:** 86

## Goal
Persona-driven signup wizard (mockups **W2–W5**).

```
Step 1 (W2)  ●──○──○   How will you use BiBoTracking?
 ┌ 🧍 Just me ┐ ┌ 👥 My team ┐ ┌ 👨‍👩‍👧 My family ┐
 │ 100% local │ │ staff/freel│ │ kids' screen │
 │ No account │ │ Free acct  │ │ Free acct    │
 │[Use locally]│ │[Continue →]│ │ [Continue →] │
 └────────────┘ └────────────┘ └──────────────┘

Personal → W3:  🧍 local-only — [Download macOS] [Download Windows]
Team/Family →
 Step 2 (W4) ●──●──○   name / email / password  → [ Create account → ]
 Step 3 (W5) ●──●──●   Name your [team|family]  → [ Finish setup ]
            on success: ✦ You're all set! ✓ Account ✓ team ○ Invite people
```

## Scope
- `src/auth/SignupWizard.tsx` with `StepDots` progress.
- Step 1 persona pick. **Personal →** W3 download CTA, creates **no account**.
- **Team / Family →** W4 account form → `register({ account_type })` →
  W5 name team/family → `createBusiness(name)` → `SuccessBurst` → dashboard.
- Labels switch team↔family by persona. Validation + error states (email taken,
  password < 8 chars).
- Extend `register()` in `api/endpoints.ts` to send `account_type`.
- Wire routes in `App.tsx`.

## Acceptance criteria
- [ ] Persona step routes correctly; personal never calls `register`.
- [ ] Manager signup → `account_type=manager`, business `kind=team`; parent →
      `parent` / `family`.
- [ ] Step dots advance; completion shows `SuccessBurst`; "Go to dashboard" works.
- [ ] Errors (duplicate email, weak password) shown inline without losing state.
- [ ] team/family wording correct throughout the chosen branch.
