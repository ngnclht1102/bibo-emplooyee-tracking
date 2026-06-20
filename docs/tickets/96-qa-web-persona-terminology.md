# 96 — QA: web persona terminology

- **Phase:** 7
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 95

## Checks
- [ ] Sign in as a **parent** (family business): nav, Dashboard table header,
      Employees page title/buttons/empty states, EmployeeDetail breadcrumb+title,
      and Settings copy all say **Kid/Kids**.
- [ ] Sign in as a **manager** (team business): everything still says
      **Employee/Employees**.
- [ ] Singular/plural correct in each spot.
- [ ] `/employees` URL still works (only labels changed).
- [ ] Toggling override in Settings shows kid/employee-correct toast text.
