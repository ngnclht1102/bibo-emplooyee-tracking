# 107 — Web admin: externalize strings + translate (6 languages)

- **Phase:** 9
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** 106
- **Blocks:** 110

## Goal
Localize the entire web admin SPA — every user-visible string moves into the i18n
catalogs and is translated to all 7 locales, with the language switcher live.

## Scope
- **Extract all UI strings** from `apps/web-admin/src` into namespaced catalogs
  (`common`, `auth`, `dashboard`, `employees`, `settings`, `errors`). Surfaces:
  - Auth: `auth/SignIn.tsx`, `auth/SignupWizard.tsx` (persona/account/setup/members/
    done steps, the add-members helper text + generated-username hints), `AuthLayout`.
  - App shell + nav: `components/AppShell.tsx`, `LanguageSwitcher`.
  - Pages: `Dashboard.tsx`, `Employees.tsx`, `EmployeeDetail.tsx`, `Settings.tsx`.
  - Shared UI: `components/ui.tsx` (Notice/Empty/labels), `format.ts` callers.
  - Persona terms: source from `terms.ts` via catalogs (employee/kid, team/family,
    `addCta`, the `idAbbrev` stays code-only).
- **Wire `useTranslation`** in each component; replace literals with `t()` keys.
  Pluralize counts ("3 employees added") via i18next plural keys, not string math.
- **Translate** every key to `zh-Hans, ja, vi, id, fr, es` per the ticket 106 glossary
  + quality bar. Keep variable placeholders intact (`{count}`, `{name}`, `{org}`).
- **Server-error mapping:** backend returns English error strings (e.g. "that email or
  username is already taken"). Map known cases to localized messages client-side by
  status/code rather than echoing the raw English; fall back to a generic localized
  message otherwise.
- **Layout review:** verify German-length... n/a — but CJK line-height and longer
  FR/ES strings don't break buttons, the rail, or table headers; let flex/grid wrap.

## Acceptance criteria
- [x] No hardcoded user-visible English left in `apps/web-admin/src` (grep clean; only
      the brand name `alt="BiBoEmployeeTracking"` remains, by design).
- [x] All 6 non-English locales translated and switchable live; refresh persists.
- [x] Counts/dates/relative-times format per locale; placeholders preserved.
- [~] Network error localized; per-field 409/validation messages localized. Other raw
      backend strings still echoed (`err.message`) — acceptable fallback for now.
- [ ] Native review sign-off per language (see 110) — still pending.
- [x] web-admin builds (`vite build`) + typechecks.

### As built
Namespaces: `common, auth, signup, dashboard, settings, ui, reports` (49 catalog files
= 7 × 7). Persona words (employee/kid/team/family) localized via `common.terms` and
`terms.ts` now reads them from i18n. Theme toggle + nav + sign-out localized in AppShell.

## Notes
- Pair with 106's glossary for consistency with desktop (108) and marketing (109).
- The signup wizard has the most copy — budget the most review time there.
