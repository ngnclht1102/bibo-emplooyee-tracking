# 84 — Web auth shell + sign-in revamp

- **Phase:** 7
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** 83
- **Blocks:** 85, 86

## Goal
Revamp the web sign-in into a logo + gradient welcome surface (mockup **W1**).

```
        ◆  BiBoEmployeeTracking   (logo lockup, soft accent→bg gradient)
        ┌──────────────────────────────────────────┐
        │  Welcome back                            │
        │  Email   [ you@company.com            ]  │
        │  Password[ ••••••••••                 ]  │
        │            [  Sign in  ]                 │
        │  New here?  Create an account →          │
        └──────────────────────────────────────────┘
   Just tracking yourself locally?  Download the app — no account needed.
```

## Scope
- Split `apps/web-admin/src/pages/Login.tsx` into:
  - `src/auth/AuthLayout.tsx` — logo + `--welcome-gradient` + centered `.auth-card`.
  - `src/auth/SignIn.tsx` — email/password form using existing `login()`.
- Footer: "Create an account →" (routes to wizard, task 85) and the personal
  "Download the app — no account needed" line.
- Keep `AuthContext` / `tokenStore` wiring intact.

## Acceptance criteria
- [ ] Sign-in shows logo + gradient + centered card per W1; flat dashboard unchanged.
- [ ] Valid creds sign in and land in the dashboard; invalid show an inline error.
- [ ] "Create an account →" navigates to the signup wizard route.
- [ ] Light + dark both legible.
