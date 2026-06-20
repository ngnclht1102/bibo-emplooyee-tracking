# 103 — Onboarding & auth polish (re-run setup, drop GIF placeholder, unified nav)

- **Phase:** 7
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** —
- **Blocks:** —

## Goal
Small follow-up tweaks to the desktop onboarding / auth surfaces and the shared
auth box treatment, on top of the signature background (task 101).

## Scope
- **"Set up again" link (desktop, local mode):** in the sidebar footer, when the
  user is in local-only mode ("Local · no account"), add an accent link that takes
  them to the sign-in page — clears `local_only` and sets `showLogin`, so the auth
  gate renders `<Login>` directly (Back returns to the Welcome/persona screen).
  Reuses the existing `.signout` link style.
  - `apps/desktop/src/App.tsx` (sidebar footer).

- **Glass box background on every auth/onboarding page (web + desktop):** every box
  gets the translucent glass surface (matches `.rail-panel`): `var(--surface)` +
  `backdrop-filter: blur(12px)` + hairline `var(--border)` + radius + padding.
  - Web: `.auth-card` (Sign in / persona / personal) and `.welcome-main` (rail steps).
  - Desktop: `.login-card` (Sign in / Welcome) and `.welcome-main` (onboarding).

- **Remove GIF placeholder (desktop onboarding):** drop the
  `[ GIF: toggling the permission in System Settings ]` /
  `[ GIF: enabling capture on Windows ]` placeholder slot from the permissions step;
  `<Permissions />` now sits directly under the heading. Removed the now-unused
  `IS_WINDOWS` const.
  - `apps/desktop/src/screens/Onboarding.tsx`.

- **Unified wizard/onboarding navigation (web + desktop):** standardize on a
  **top Back link + full-width primary CTA** layout (replaces the old bottom
  Back/Next split and the inline back links). Shared classes `.back-top` (larger
  top-left back link), `.btn-block` (full-width CTA), and `.onb-actions`/`.onb-skip`
  (stacked CTA with a centered "Skip" link below) added to both theme files.
  - Web: `auth/SignupWizard.tsx` (persona/account/setup/members/done), `auth/SignIn.tsx`.
  - Desktop: `screens/Onboarding.tsx`, `screens/Login.tsx`.

## Acceptance criteria
- [x] Local-mode desktop sidebar shows a "Set up again" link that opens the sign-in page.
- [x] Every web + desktop auth/onboarding page renders the glass box background
      (`.auth-card`, `.login-card`, `.welcome-main`), matching the rail panel.
- [x] Onboarding permissions step no longer shows the GIF placeholder; build clean
      (no unused `IS_WINDOWS`).
- [x] Web + desktop wizard/onboarding nav uses the unified top-Back + full-width-CTA
      layout; both apps typecheck (`tsc --noEmit`).

## Notes
- The `.gif-slot` CSS and the extension-install placeholder in `Browser.tsx` are left
  in place — only the onboarding permissions GIF was removed.
