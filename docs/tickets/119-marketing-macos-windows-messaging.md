# 119 — Marketing: cross-platform messaging (macOS + Windows), SEO + visible copy

**Status:** Done

## Problem

Release 1.1.0 (ticket 118) added the Windows MSI download buttons to the marketing
site, but the surrounding **copy and SEO metadata still described the product as
macOS-only**. Across all 7 locales the page said things like "a Hubstaff alternative
**for macOS**", "stored locally on each **Mac**", "Install the **macOS app**", and the
footer/eyebrow read "· macOS". Search metadata only carried macOS keywords. So a Windows
visitor (and Google) was told this was a Mac product, even though the Windows installer
sat right there in the hero.

## Change

Updated the marketing **source** (generated site — never hand-edit `site/`) to present
**macOS & Windows** everywhere, then rebuilt.

### SEO / metadata — `marketing/src/template.html`
- `keywords`: added `Windows time tracking`, `time tracking app for windows`,
  `employee monitoring for windows` (macOS terms kept).
- JSON-LD `operatingSystem` already listed `macOS 13+, Windows 10+` — left as-is.

### Copy — `marketing/src/i18n/<code>.json` (all 7 locales: en, zh, ja, vi, id, fr, es)
20 keys per locale updated to mirror the canonical English wording:
- `meta.description` / `ogTitle` / `ogDescription` / `ogImageAlt` / `twitterDescription`
  and `jsonld.appDescription` → "for **macOS & Windows**".
- `faq.q1.answer` → "for macOS & Windows"; `faq.q4.answer` + `oss.intro` → "**desktop
  app (macOS & Windows)** and Chrome extension".
- `hero.eyebrow` / `footer.copyright` → "· macOS & Windows".
- `hero.ledeB` → "for macOS & Windows" + "stored locally on each **computer**" (was "each
  Mac").
- `hero.note` → platform clause now "macOS (Apple Silicon + Intel) **& Windows 10+**".
- `features.menubar.p` → "menu-bar (**system-tray on Windows**) indicator".
- `demo.intro` / `how.step1.h` / `cta.intro` → "the **desktop app**" (was "macOS app").
- `how.step1.p` → "installs … on **macOS or Windows** and grants the requested capture
  permissions (Accessibility, Input Monitoring and Screen Recording **on macOS**)".
- `showcase.tabDesktop` → "On the employee's **computer**" (was "…Mac").
- `personas.solo.p` → "nothing ever leaves your **computer**".

Download **button** labels (`downloadMac`/`downloadWin`, pricing `btn`/`btnWin`, footer)
were already correct (separate macOS + Windows variants) and left untouched.

## Verify

- All 7 JSON catalogs parse; `node marketing/build.mjs` emits en + 6 locale pages +
  sitemap/robots with no unresolved placeholders.
- Built `site/index.html`: `<meta name="description">` and `og:title` read "for macOS &
  Windows"; keywords carry the Windows terms.
- No `each Mac` / `your Mac` / `the macOS app` / `employee's Mac` left in built en.
- Spot-checked zh ("专为 macOS 和 Windows 打造", "每台电脑本地") and fr ("application de
  bureau", "chaque ordinateur", "macOS ou Windows").

> Not yet redeployed — run the `deploy-production` skill to push to bibotracker.com.
