# 115 — Marketing home page: per-environment build (production SEO/GA + i18n fixes)

**Status:** Done

## Problem

The marketing landing page was generated once (staging-targeted) and the same bytes
were deployed to both environments, so **production (bibotracker.com) served
staging-baked HTML**:

1. **SEO → staging.** `canonical`, `og:url`/`og:image`, `twitter:image`, JSON-LD `url`/
   `downloadUrl`, `hreflang`, sitemap and robots all pointed at
   `staging.example.com` even on bibotracker.com.
2. **Google Analytics → wrong/shared property.** Template hardcoded `G-8Y4M4LWDKT`.
3. **"Language not work"** — two distinct causes:
   - The in-page language switcher used **absolute staging URLs**
     (`https://staging.example.com/zh/`), so switching language on
     bibotracker.com bounced the user to the staging domain.
   - Locale subpages (`/zh/`, `/ja/`…) referenced assets with **subdir-relative** paths
     (`styles.css`, `assets/…`). From `/zh/` the browser requested `/zh/styles.css`,
     which doesn't exist → the Go static handler fell back to the marketing `index.html`
     (HTML served with a 200) → **every non-English page rendered unstyled with broken
     images**.

## Change

`marketing/build.mjs` is now **environment-aware** (`node marketing/build.mjs [staging|
production]`, default `staging`):

| Env | Base URL | Google Analytics | Output dir |
|---|---|---|---|
| staging | `https://staging.example.com` | none | `marketing/site/` (committed) |
| production | `https://bibotracker.com` | `G-EKVNL0JY98` | `marketing/site-prod/` (gitignored) |

- `ENVS` map at the top of `build.mjs` holds base/GA/out per env; overridable via
  `SITE_ENV` / `SITE_BASE_URL` / `SITE_GA_ID` / `SITE_OUT`.
- Template (`marketing/src/template.html`) now uses placeholders: `{{__base}}` (absolute
  SEO URLs), `{{__host}}` (demo browser-bar mockup), `{{__analytics}}` (GA block, empty
  when no id). GA hardcode removed.
- **Language switcher links are root-relative** (`/`, `/zh/`…) → host-agnostic.
- **All asset/stylesheet refs are root-relative** (`/styles.css`, `/assets/…`) → locale
  subpages load CSS/images correctly.
- `build.mjs` also emits `robots.txt` (env-specific `Sitemap:` line) alongside
  `sitemap.xml`.

Deploy wiring:
- `deploy/build.sh` (staging) runs `node marketing/build.mjs staging` before staging the
  web root.
- `deploy/build-prod.sh` (production) runs `node marketing/build.mjs production`, copies the
  shared static assets from committed `marketing/site/`, then **overlays** the
  production-rendered HTML + `sitemap.xml` + `robots.txt` on top.
- Cache-bust now stamps `?v=$VERSION` on `/styles.css` across **every** page (root +
  per-locale), not just the root.

Docs updated: `deploy-staging` / `deploy-production` skills (the "no build step" note was
stale), `marketing/README.md`.

## Verify

- `node marketing/build.mjs` (default) → `site/` has bibotracker.com base, no GA, root-relative
  assets + lang links.
- `node marketing/build.mjs production` → `site-prod/` has bibotracker.com base, GA
  `G-EKVNL0JY98`, root-relative assets + lang links; per-locale canonical/og rewritten.
- Post-deploy (both envs): switch language → styled localized page on the same host;
  `curl` canonical/og/GA reflect the env; `/zh/styles.css` no longer needed (page links
  `/styles.css`). Mind Cloudflare edge cache — verify the *served* asset.
