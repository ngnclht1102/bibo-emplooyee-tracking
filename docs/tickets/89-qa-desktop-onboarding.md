# 89 — QA: desktop onboarding (macOS + Windows)

- **Phase:** 7
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 88

## Checks
Run on macOS and on the Windows build PC (`ssh winbuild`), clearing local session +
settings before each pass.

- [ ] Fresh launch → Welcome (D1). "Use locally" skips login → onboarding.
- [ ] "Sign in" path logs in → onboarding.
- [ ] "Sign up on the web →" opens the browser to the signup page.
- [ ] Step 1 copy correct per persona (personal vs employee vs kid).
- [ ] Step 2 toggles: personal all free; employee sees locked owner-managed rows.
- [ ] Step 3 permission rows reflect real status, update on return from Settings;
      GIF placeholder visible; Windows shows its own variant.
- [ ] Finish → dashboard; relaunch does not repeat onboarding.
