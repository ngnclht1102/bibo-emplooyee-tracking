# 100 — QA: desktop onboarding rail

- **Phase:** 7
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 99

## Checks
Run on macOS and Windows (`ssh winbuild`), clearing local settings before each pass.

- [ ] Onboarding shows the two-column layout with the right-side rail; markers
      advance (done ✓ / current / upcoming) across the 3 steps — matches the image.
- [ ] Personal / employee / kid copy correct on step 1.
- [ ] Step 2 toggles: personal all free; employee/kid see locked org-managed rows.
- [ ] Step 3 shows live permission rows + GIF slot; Windows shows its variant.
- [ ] Finish → dashboard; relaunch does not repeat onboarding.
- [ ] Narrow window collapses the rail to StepDots.
