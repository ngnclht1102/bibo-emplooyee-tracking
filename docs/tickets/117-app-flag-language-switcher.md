# 117 — Flag language switcher in web admin + desktop (onboarding & dashboard)

**Status:** Done

## Why

The marketing site got a flag-based language switcher (ticket 116) — trigger shows the
current flag + native name, dropdown lists every locale with its flag. The web admin and
desktop app still used a plain `<select class="lang-switcher">`. Bring the same polished
control to the **onboarding** and **dashboard** surfaces in both apps so the experience
feels consistent end to end.

## Change

### Shared component (both apps)
`LanguageSwitcher` rewritten from a `<select>` to a custom flag dropdown:
- Trigger: current locale's **flag + native name** + caret.
- Menu: every locale with its flag; active one highlighted.
- Opens on click; closes on outside-click / Escape (real popover, not a native select).
- New `align` ("left"|"right", default right) + `drop` ("up"|"down", default down) props so
  the menu never clips its container.
- `flag` added to the `LOCALES` map in each app's `i18n/index.ts` (🇺🇸🇨🇳🇯🇵🇻🇳🇮🇩🇫🇷🇪🇸,
  matching marketing).
- CSS (`.lang-switcher/.lang-trigger/.lang-menu/.lang-opt`) added to each app's theme,
  using the shared design tokens; the menu uses the translucent `--surface-strong` glass.

### Web admin (`apps/web-admin`)
- **Onboarding / auth** (`AuthLayout`) — already rendered the switcher (top-right); now the
  flag version.
- **Dashboard** (`AppShell` sidebar footer) — `align="left" drop="up"` so the menu opens
  upward and left, fitting the narrow 200px sidebar without clipping.

### Desktop (`apps/desktop`)
- **Onboarding** — added the switcher (top-right, `.welcome-lang`) to **Welcome**,
  **Login**, and **Onboarding** screens (previously only in Settings).
- **Dashboard** — added it to the main header row (next to the theme segmented control).
- **Settings** — existing placement now renders the flag version.
- Still mirrors the choice to the native side via `invoke("set_locale")` so the tray
  follows the language.

## Verify

- `tsc --noEmit` + `vite build` clean for both apps.
- Browser-tested the web admin (local dev): onboarding shows 🇺🇸 English, the dropdown lists
  all 7 with flags, selecting 日本語 localizes the whole page; the dashboard sidebar opens
  the menu upward/left without clipping.
- Deployed web admin to staging + production; live `/admin` bundles contain the new control.
- Desktop builds clean; native installers unchanged (ship on the next desktop release).
