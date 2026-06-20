# 87 — Desktop login revamp + signup link + personal branch

- **Phase:** 7
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** 83
- **Blocks:** 88, 89

## Goal
Add the first-run persona branch and a web signup link, and revamp desktop login
(mockups **D1, D2**).

```
D1 Welcome:   ◆ logo — Welcome, let's get you set up.
 ┌ 🧍 Just me (local) ┐  ┌ 👥/👨‍👩‍👧 I have an account ┐
 │ Offline, no account│  │ Sign in with creds      │
 │   [ Use locally → ]│  │      [ Sign in → ]      │
 └────────────────────┘  └─────────────────────────┘
     Need an account?  Sign up on the web →  (opens browser)

D2 Login:  ◆ logo — Sign in — email / password — [ Sign in ]
           No account yet?  Sign up on the web →
```

## Scope
- New `apps/desktop/src/screens/Welcome.tsx` (D1), shown on first run when there is
  no session and `local_only` is not set.
  - "Use locally" → set new `local_only` flag in `AppSettings`, proceed to
    onboarding (task 88), never hitting login.
  - "Sign in" → revamped `screens/Login.tsx` (D2).
- "Sign up on the web →" opens the web signup URL in the default browser. Verify /
  enable the Tauri opener (or shell) plugin in `src-tauri`; add an `open_signup`
  command.
- Logo + gradient on both screens; gate in `App.tsx` per the state machine in the
  design doc.

## Files
- `apps/desktop/src/screens/{Welcome.tsx,Login.tsx}`, `App.tsx`,
  `src-tauri/src/commands/mod.rs` (+ opener plugin), `AppSettings` (`local_only`).

## Acceptance criteria
- [ ] First launch with no session shows D1.
- [ ] "Use locally" sets `local_only`, skips login, goes to onboarding.
- [ ] "Sign in" reaches D2; valid creds create a session as today.
- [ ] "Sign up on the web →" opens the signup page in the system browser.
- [ ] Logo + gradient render in light & dark; relaunch respects `local_only`/session.
