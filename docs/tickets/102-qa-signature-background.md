# 102 — QA: signature background + translucent surfaces

- **Phase:** 7
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 101

## Checks
- [ ] **Web admin:** every page (Login, Signup wizard, Dashboard, Employees,
      EmployeeDetail, Settings) sits on the bold blue→violet→pink background; panels
      are translucent glass; text/tables/charts stay legible — light **and** dark.
- [ ] **Desktop:** every screen (Welcome, Login, Onboarding, Dashboard, Activity,
      Screenshots, Browser, Permissions, Settings) shows the same background +
      translucent surfaces — light and dark.
- [ ] Signup/onboarding cards are transparent (background continuous behind them).
- [ ] Inputs, focus rings, hairline borders remain clearly visible over the gradient.
- [ ] No motion/jank; switching theme swaps the gradient cleanly.
- [ ] Spot-check contrast on dense data (timeline, breakdown table, stat cards).
