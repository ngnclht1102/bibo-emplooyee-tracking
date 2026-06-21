# 116 — Marketing: persona content (solo/team/family) + flag language switcher

**Status:** Done

## Why

The marketing site was framed almost entirely as team/employee monitoring ("Hubstaff
alternative"), but the product now serves **three personas** (see
[14-signup-and-onboarding.md](../14-signup-and-onboarding.md)): a **solo local-only**
user ("Just me", no account), a **team/owner**, and a **family/parent**. The home page
needed to speak to all three. Separately, the header language control was a bare 🌐 globe
that didn't show the current language.

## Change

### 1. "Who it's for" personas section (new)
- New `#personas` section on the landing page (after the stat strip), with three cards:
  **Just you** (🧍, "No account needed"), **Your team** (👥, "Free account"), **Your
  family** (👨‍👩‍👧, "Free account") — each a one-line benefit + a tag, matching the persona
  vocabulary in the app. Emoji icons (no new image assets).
- New nav anchor "Who it's for" → `#personas`.
- 13 new i18n keys (`nav.personas`, `personas.*`) added to **all 7 locales**
  (en/zh/ja/vi/id/fr/es) — 185 → 198 keys each. The strong "Hubstaff alternative" hero
  copy is intentionally unchanged (SEO); the personas section carries the breadth.
- New CSS: `.personas`, `.persona-grid`, `.persona-card`, `.persona-ic`, `.persona-tag`
  (mirrors the existing feature-card design tokens).

### 2. Flag language switcher
- The switcher trigger now shows the **current locale's flag + native name** (e.g.
  🇺🇸 English, 🇫🇷 Français) with a caret; the dropdown lists every locale with its flag.
  Flags added to the `LOCALES` map in `marketing/build.mjs`; `langSwitcher()` rewritten.
- Links stay **root-relative** and host-agnostic (no JS). Opens on hover **or** focus
  (`tabindex` + `:focus-within`) for keyboard/touch.
- Switcher styled as a bordered pill; the native label hides under 560px (flag only).

### 3. Header layout hardening
Adding a 6th nav anchor + the wider flag switcher overflowed the 1120px-capped header
for longer locale labels (fr "Comment ça marche", id "Bahasa Indonesia") — links wrapped
and collided with the brand. Fixed: nav links `white-space: nowrap`, tighter font/gap,
`.nav-links { margin-right: auto }` + a min `gap` on `.nav .wrap` (instead of
`space-between`, which left zero slack), and anchors hide below 1080px. Verified at the
worst-case content width for both French (longest labels) and Indonesian (widest
switcher).

## Verify

Generated + deployed to **staging** and **production**, interactively tested with a
browser: personas section renders localized + styled on every locale; the switcher shows
the current flag/name and the dropdown lists all 7 with flags; headers fit without
collisions in en/fr/id. GA/SEO per-env values from ticket 115 still correct.
