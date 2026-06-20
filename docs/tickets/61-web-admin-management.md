# 61 — Web admin: business & employee management

- **Phase:** 5
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** 39, 59
- **Blocks:** 65

## Goal
Owner UI to manage businesses and employees against the task 39 endpoints.

## Scope
- Create / view businesses (`/businesses`, `/businesses/mine`).
- Employee roster per business; create employee (email + temp password) form.
- Surface the auto-business behavior (creating an employee with no business makes one).
- Inline validation (duplicate email, weak password) from API errors.

## Acceptance criteria
- [ ] Owner creates a business and sees it listed.
- [ ] Owner adds an employee; the employee then logs in (desktop/web).
- [ ] First employee with no business triggers + shows the auto-created business.
- [ ] API validation errors render inline.
- [ ] Only the owner's businesses are visible.
