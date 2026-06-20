# 98 — QA: web wizard rail + add-members

- **Phase:** 7
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 97

## Checks
- [ ] Wizard renders two columns with the right-side progress rail; markers update
      (done ✓ / current ring / upcoming grey) as you advance — matches the image.
- [ ] **Manager:** create account → name team → add 2 employees → finish; the two
      `users` rows + employee memberships exist; dashboard shows them.
- [ ] **Parent:** same flow shows "Add your kids" wording; members created.
- [ ] Add-members: duplicate email + weak password show inline errors; remove works;
      "Skip for now" creates none and still finishes.
- [ ] Finish checklist reflects the real added count.
- [ ] Personal path unaffected; narrow window collapses rail to StepDots.
