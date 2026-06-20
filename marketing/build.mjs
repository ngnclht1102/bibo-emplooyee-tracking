#!/usr/bin/env node
// Static i18n generator for the marketing site.
// Renders template.html + i18n/<code>.json into per-locale pages with hreflang/SEO:
//   en  -> marketing/site/index.html        (root)
//   xx  -> marketing/site/<seg>/index.html  (e.g. /zh/, /ja/)
// Run: node marketing/build.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, "src"); // template + i18n sources (not served)
const SITE = join(ROOT, "site"); // generated, servable output (deployed at /)
const BASE = "https://employeetracking.namnguyen.pro";

// locale code -> { seg: URL path segment ("" = root), bcp47: <html lang>, og: og:locale, label }
const LOCALES = {
  en: { seg: "", bcp47: "en", og: "en_US", label: "English" },
  zh: { seg: "zh", bcp47: "zh-Hans", og: "zh_CN", label: "中文" },
  ja: { seg: "ja", bcp47: "ja", og: "ja_JP", label: "日本語" },
  vi: { seg: "vi", bcp47: "vi", og: "vi_VN", label: "Tiếng Việt" },
  id: { seg: "id", bcp47: "id", og: "id_ID", label: "Bahasa Indonesia" },
  fr: { seg: "fr", bcp47: "fr", og: "fr_FR", label: "Français" },
  es: { seg: "es", bcp47: "es", og: "es_ES", label: "Español" },
};

const urlFor = (code) => `${BASE}/${LOCALES[code].seg ? LOCALES[code].seg + "/" : ""}`;

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v, key, out);
    else out[key] = String(v);
  }
  return out;
}

// hreflang alternates + x-default, for the <head>. (Canonical is the template's own
// line, rewritten per-locale in step 3 — so we don't emit a duplicate here.)
function headAlts(code) {
  void code;
  const lines = [];
  for (const c of Object.keys(LOCALES)) {
    lines.push(`<link rel="alternate" hreflang="${LOCALES[c].bcp47}" href="${urlFor(c)}" />`);
  }
  lines.push(`<link rel="alternate" hreflang="x-default" href="${urlFor("en")}" />`);
  return lines.join("\n  ");
}

// Compact language switcher (plain links — no JS, SEO-friendly).
function langSwitcher(code) {
  const items = Object.keys(LOCALES)
    .map((c) => {
      const cur = c === code ? ' aria-current="true"' : "";
      return `<a class="lang-opt" href="${urlFor(c)}"${cur}>${LOCALES[c].label}</a>`;
    })
    .join("");
  return `<div class="lang-switcher" aria-label="Language">🌐<div class="lang-menu">${items}</div></div>`;
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
    .split("{{__head_alts}}").join(headAlts(code))
    .split("{{__lang_switcher}}").join(langSwitcher(code));

  // 3) per-locale canonical/og:url/JSON-LD url + og:locale. Targeted replacements
  // (NOT a blanket BASE-url swap, which would also clobber the hreflang alternates
  // and the language switcher's English/root links).
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
  console.log(`✓ ${code.padEnd(3)} → ${outPath.replace(SITE + "/", "site/")}`);
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

console.log("done.");
