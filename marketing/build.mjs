#!/usr/bin/env node
// Static i18n generator for the marketing site.
// Renders template.html + i18n/<code>.json into per-locale pages with hreflang/SEO,
// targeting one of the deploy environments (absolute URLs + analytics differ per env):
//   en  -> <out>/index.html        (root)
//   xx  -> <out>/<seg>/index.html  (e.g. /zh/, /ja/)
//
// Run:
//   node marketing/build.mjs                 # staging (default) -> marketing/site/
//   node marketing/build.mjs staging         # same as above
//   node marketing/build.mjs production       # production       -> marketing/site-prod/
//
// Env overrides (rarely needed): SITE_ENV, SITE_BASE_URL, SITE_GA_ID, SITE_OUT.
//
// Note: the in-page language switcher uses ROOT-RELATIVE links (/, /zh/, …) so it works
// on whatever host serves the files. Only SEO-facing URLs (canonical, og:url, hreflang,
// JSON-LD, sitemap) are absolute and therefore environment-specific.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, "src"); // template + i18n sources (not served)

// Per-environment build config. `out` is the generated, servable output dir.
//  - staging keeps the committed marketing/site/ (no analytics — avoids polluting GA).
//  - production renders to marketing/site-prod/ (gitignored, built at deploy time).
const ENVS = {
  staging: {
    base: "https://employeetracking.namnguyen.pro",
    ga: "", // no Google Analytics on staging
    out: "site",
  },
  production: {
    base: "https://bibotracker.com",
    ga: "G-EKVNL0JY98",
    out: "site-prod",
  },
};

const ENV_NAME = (process.argv[2] || process.env.SITE_ENV || "staging").toLowerCase();
if (!ENVS[ENV_NAME]) {
  throw new Error(`unknown env "${ENV_NAME}" — expected one of: ${Object.keys(ENVS).join(", ")}`);
}
const ENV = ENVS[ENV_NAME];
const BASE = process.env.SITE_BASE_URL || ENV.base;
const GA_ID = process.env.SITE_GA_ID ?? ENV.ga;
const SITE = join(ROOT, process.env.SITE_OUT || ENV.out);
const HOST = BASE.replace(/^https?:\/\//, ""); // bare host for the demo browser-bar mockup

// locale code -> { seg: URL path segment ("" = root), bcp47: <html lang>, og: og:locale,
//                  label: native name, flag: emoji shown in the language switcher }
const LOCALES = {
  en: { seg: "", bcp47: "en", og: "en_US", label: "English", flag: "🇺🇸" },
  zh: { seg: "zh", bcp47: "zh-Hans", og: "zh_CN", label: "中文", flag: "🇨🇳" },
  ja: { seg: "ja", bcp47: "ja", og: "ja_JP", label: "日本語", flag: "🇯🇵" },
  vi: { seg: "vi", bcp47: "vi", og: "vi_VN", label: "Tiếng Việt", flag: "🇻🇳" },
  id: { seg: "id", bcp47: "id", og: "id_ID", label: "Bahasa Indonesia", flag: "🇮🇩" },
  fr: { seg: "fr", bcp47: "fr", og: "fr_FR", label: "Français", flag: "🇫🇷" },
  es: { seg: "es", bcp47: "es", og: "es_ES", label: "Español", flag: "🇪🇸" },
};

// Absolute URL (SEO: canonical, og, hreflang, sitemap).
const urlFor = (code) => `${BASE}/${LOCALES[code].seg ? LOCALES[code].seg + "/" : ""}`;
// Root-relative URL (in-page language switcher — host-agnostic).
const relUrlFor = (code) => `/${LOCALES[code].seg ? LOCALES[code].seg + "/" : ""}`;

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v, key, out);
    else out[key] = String(v);
  }
  return out;
}

// hreflang alternates + x-default, for the <head>. Absolute by spec. (Canonical is the
// template's own line, rewritten per-locale in step 3 — so we don't emit a duplicate here.)
function headAlts() {
  const lines = [];
  for (const c of Object.keys(LOCALES)) {
    lines.push(`<link rel="alternate" hreflang="${LOCALES[c].bcp47}" href="${urlFor(c)}" />`);
  }
  lines.push(`<link rel="alternate" hreflang="x-default" href="${urlFor("en")}" />`);
  return lines.join("\n  ");
}

// Language switcher: the trigger shows the CURRENT locale's flag + native name; the dropdown
// lists every locale with its flag. Plain ROOT-RELATIVE links — no JS, SEO-friendly, and
// host-agnostic so the same markup works on staging and production. Opens on hover or focus
// (keyboard / touch via tabindex + :focus-within in styles.css).
function langSwitcher(code) {
  const items = Object.keys(LOCALES)
    .map((c) => {
      const cur = c === code ? ' aria-current="true"' : "";
      return `<a class="lang-opt" href="${relUrlFor(c)}"${cur}><span class="lang-flag">${LOCALES[c].flag}</span>${LOCALES[c].label}</a>`;
    })
    .join("");
  const cur = LOCALES[code];
  return (
    `<div class="lang-switcher" aria-label="Language" tabindex="0">` +
    `<span class="lang-flag">${cur.flag}</span><span class="lang-label">${cur.label}</span>` +
    `<svg class="lang-caret" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>` +
    `<div class="lang-menu">${items}</div></div>`
  );
}

// Analytics block injected into <head> (empty when no GA id is configured, e.g. staging).
function analytics() {
  if (!GA_ID) return "";
  return `
  <link rel="preconnect" href="https://www.googletagmanager.com" />
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());

    gtag('config', '${GA_ID}');
  </script>`;
}

const template = readFileSync(join(SRC, "template.html"), "utf8");

for (const code of Object.keys(LOCALES)) {
  const strings = flatten(JSON.parse(readFileSync(join(SRC, "i18n", `${code}.json`), "utf8")));
  let html = template;

  // 1) content placeholders
  for (const [key, val] of Object.entries(strings)) {
    html = html.split(`{{${key}}}`).join(val);
  }
  // 2) build placeholders
  html = html
    .split("{{__lang}}").join(LOCALES[code].bcp47)
    .split("{{__base}}").join(BASE)
    .split("{{__host}}").join(HOST)
    .split("{{__analytics}}").join(analytics())
    .split("{{__head_alts}}").join(headAlts())
    .split("{{__lang_switcher}}").join(langSwitcher(code));

  // 3) per-locale canonical/og:url/JSON-LD url + og:locale. Targeted replacements
  // (NOT a blanket BASE-url swap, which would also clobber the hreflang alternates).
  if (code !== "en") {
    const u = urlFor(code);
    html = html
      .replace(`<link rel="canonical" href="${BASE}/" />`, `<link rel="canonical" href="${u}" />`)
      .replace(`property="og:url" content="${BASE}/"`, `property="og:url" content="${u}"`)
      .replace(`"url": "${BASE}/"`, `"url": "${u}"`)
      .split('content="en_US"').join(`content="${LOCALES[code].og}"`);
  }

  // 4) safety: no unresolved placeholders
  const leftover = html.match(/\{\{[^}]+\}\}/g);
  if (leftover) throw new Error(`[${code}] unresolved placeholders: ${[...new Set(leftover)].join(", ")}`);

  const outPath = code === "en" ? join(SITE, "index.html") : join(SITE, code, "index.html");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html, "utf8");
  console.log(`✓ ${code.padEnd(3)} → ${outPath.replace(SITE + "/", ENV.out + "/")}`);
}

// sitemap.xml with hreflang alternates for every locale URL.
const lastmod = new Date().toISOString().slice(0, 10);
const altLinks = [...Object.keys(LOCALES), "x-default"]
  .map((c) => {
    const hl = c === "x-default" ? "x-default" : LOCALES[c].bcp47;
    const href = c === "x-default" ? urlFor("en") : urlFor(c);
    return `      <xhtml:link rel="alternate" hreflang="${hl}" href="${href}" />`;
  })
  .join("\n");
const urls = Object.keys(LOCALES)
  .map(
    (c) => `  <url>
    <loc>${urlFor(c)}</loc>
${altLinks}
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${c === "en" ? "1.0" : "0.9"}</priority>
  </url>`,
  )
  .join("\n");
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
writeFileSync(join(SITE, "sitemap.xml"), sitemap, "utf8");
console.log("✓ sitemap.xml");

// robots.txt — welcomes search + AI crawlers; the Sitemap line is environment-specific.
const robots = `# Search engines and AI / answer-engine crawlers are welcome to crawl and cite
# this site. (Note: if Cloudflare "Block AI bots" / AI Crawl Control is enabled,
# it overrides this file and blocks AI crawlers at the edge — disable it there.)
User-agent: *
Allow: /
Disallow: /admin
Disallow: /download/

# Explicitly welcome AI assistants / answer engines
User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: CCBot
Allow: /

User-agent: meta-externalagent
Allow: /

Sitemap: ${BASE}/sitemap.xml
`;
writeFileSync(join(SITE, "robots.txt"), robots, "utf8");
console.log("✓ robots.txt");

console.log(`done. (env=${ENV_NAME}, base=${BASE}, ga=${GA_ID || "none"}, out=${ENV.out}/)`);
