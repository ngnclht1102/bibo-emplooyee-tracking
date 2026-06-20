# 109 — Marketing home page: localized variants + SEO

- **Phase:** 9
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** 106
- **Blocks:** 110

## Goal
Localize the marketing landing page (`marketing/site/index.html`, ~150 visible
strings) into all 7 locales with proper international SEO, so each market gets a
native page that ranks.

## Scope
- **Per-locale pages:** generate one page per locale. Recommended layout:
  - `/` → English (`marketing/site/index.html`).
  - `/zh/`, `/ja/`, `/vi/`, `/id/`, `/fr/`, `/es/` → localized copies.
  - Since the site is static, either (a) duplicate `index.html` per locale dir with
    translated content, or (b) introduce a tiny build step that injects a per-locale
    JSON string table into a template. Prefer (b) to avoid 7 hand-maintained HTML
    files drifting — one `template.html` + `strings/<locale>.json` → emit each page.
- **Translate** all body copy, hero, feature sections, CTAs ("Download for macOS/
  Windows"), FAQ, footer — per 106 glossary + quality bar. Marketing tone may be a
  touch more persuasive than the app, but stay accurate.
- **International SEO (critical):**
  - `<html lang="...">` set per locale.
  - `hreflang` alternates linking all locales + `x-default` (English), in every page's
    `<head>`.
  - Per-locale `<title>`, `<meta name="description">`, and Open Graph / Twitter
    (`og:title`, `og:description`, `og:locale`) translated.
  - Localize the JSON-LD (`application/ld+json`) `name`/`description` where language-
    specific (keep brand name verbatim).
  - Update `sitemap.xml` to list all locale URLs with `hreflang` alternates; keep
    `robots.txt` allowing them.
- **Language switcher** in the page header/footer (links to locale URLs; remembers via
  a cookie or just relies on the URL). Auto-suggest based on `Accept-Language` is
  optional (don't hard-redirect — Google dislikes forced redirects).
- **Deploy:** the deploy skill stages this static site at `/`; ensure locale dirs ship
  too (update the deploy staging if it copies a fixed file list).

## Acceptance criteria
- [x] All 7 locale pages render with fully translated, native-quality copy
      (185 keys × 7 locales; verified key parity + no leftover placeholders).
- [x] Correct `lang`, per-locale `canonical`, `hreflang` (7 + `x-default`),
      translated `<title>`/description/OG/`og:locale`/JSON-LD per page; `sitemap.xml`
      lists all locales with `xhtml:link` alternates (XML well-formed).
- [x] Language switcher (CSS hover menu, plain links — SEO-friendly, no forced
      redirects) in the nav of every page; current locale marked `aria-current`.
- [x] CTAs/links (download `.dmg`, `/admin`, Chrome Web Store) intact on every page.
- [~] Lighthouse SEO — not run here; structure matches the EN page + adds hreflang,
      so it should meet/exceed. (Run in 110.)
- [x] Deploy ships locale dirs: deploy rsyncs all of `marketing/site/` → web root, so
      `/zh/`, `/ja/`, … ship automatically. Sources moved OUT of `site/` so they
      aren't served.

### As built (chose option b — one template + per-locale JSON)
- Source (not served): `marketing/src/template.html` (index.html with `{{key}}`
  placeholders) + `marketing/src/i18n/<code>.json` (185 keys each, en + 6).
- Generator: `marketing/build.mjs` (`node marketing/build.mjs`) renders
  `marketing/site/index.html` (en, root) + `marketing/site/<code>/index.html`, injects
  per-locale `<html lang>`, canonical, `hreflang`+`x-default`, `og:locale`, JSON-LD
  url, and the language switcher; regenerates `sitemap.xml`.
- Editing workflow: edit `src/template.html` / `src/i18n/*.json`, then re-run the
  generator. (The served `index.html` is now generated output.)
- Switcher styles appended to `marketing/site/styles.css` (`.lang-switcher`).

## Notes
- Keep one source template to prevent locale drift (option b).
- Currency/region claims (if any) should read correctly per market.
