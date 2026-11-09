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

import { readFileSync, writeFileSync, mkdirSync, statSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, "src"); // template + i18n sources (not served)

// Per-environment build config. `out` is the generated, servable output dir.
//  - default keeps the committed marketing/site/ (no analytics — avoids polluting GA).
//  - production renders to marketing/site-prod/ (gitignored, built at deploy time).
// For a private pre-prod host, don't hard-code it here — override at build time:
//   SITE_BASE_URL=https://your-host SITE_OUT=site node marketing/build.mjs
const ENVS = {
  default: {
    base: "https://bibotracker.com",
    ga: "", // no Google Analytics on the committed default build
    out: "site",
  },
  production: {
    base: "https://bibotracker.com",
    ga: "G-EKVNL0JY98",
    out: "site-prod",
  },
  staging: {
    base: "https://employeetracking.namnguyen.pro",
    ga: "",
    out: "site-staging",
    noindex: true, // staging must never be crawled/indexed
  },
};

const ENV_NAME = (process.argv[2] || process.env.SITE_ENV || "default").toLowerCase();
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
  const check = `<svg class="ck" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`;
  const items = Object.keys(LOCALES)
    .map((c) => {
      const cur = c === code ? ' aria-current="true"' : "";
      return `<a class="lang-opt" href="${relUrlFor(c)}" data-loc="${c}"${cur}>${LOCALES[c].label}${check}</a>`;
    })
    .join("");
  const globe = `<svg class="lang-globe" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>`;
  return (
    `<div class="lang-switcher" aria-label="Language" tabindex="0">` +
    globe +
    `<span class="lang-label">${code.toUpperCase()}</span>` +
    `<svg class="lang-caret" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>` +
    `<div class="lang-menu">${items}</div></div>`
  );
}

// Auto language detection. Emitted into <head> of the ENGLISH ROOT page only: on first
// visit (no stored choice) it matches the browser's preferred languages against the
// localized pages and redirects there; an explicit "en" preference (or any earlier "en"
// in the language list) stays on English. Localized pages get NO redirect — landing on
// /zh/ etc. is already an explicit choice and crawlers must not be bounced.
function autoDetect(code) {
  if (code !== "en") return "";
  const seg = Object.keys(LOCALES).filter((c) => c !== "en"); // redirect targets
  const set = JSON.stringify(Object.fromEntries(seg.map((c) => [c, 1])));
  return (
    `<script>(function(){try{` +
    `var S=${set},saved=localStorage.getItem('locale'),t=null;` +
    `if(saved){if(saved!=='en'&&S[saved])t=saved;}` +
    `else{var L=navigator.languages||[navigator.language||''];` +
    `for(var i=0;i<L.length;i++){var b=(L[i]||'').toLowerCase().split('-')[0];` +
    `if(b==='en')break;if(b==='in')b='id';if(S[b]){t=b;break;}}}` +
    `if(t)location.replace('/'+t+'/');}catch(e){}})();</script>`
  );
}

// Language switcher behaviour + locale hand-off (emitted on every page, baked with the
// page's own locale code):
//  - click/tap the trigger to toggle the menu open (CSS-only :hover broke on touch and
//    left a hover-gap on desktop where the menu closed before you could reach an option);
//  - clicking outside closes it;
//  - clicking a language option stores the pick so the root-page auto-detect honours it;
//  - clicking through to the admin app (sign in / sign up) writes the current page's
//    language to localStorage so web-admin (same origin, same 'locale' key) opens in it.
const localeJs = (code) =>
  `<script>(function(){try{var P=${JSON.stringify(code)};` +
  `document.addEventListener('click',function(e){var a=e.target.closest('a[href^="/admin"]');` +
  `if(a){try{localStorage.setItem('locale',P);}catch(_){}}});` +
  `var sw=document.querySelector('.lang-switcher');if(!sw)return;` +
  `sw.addEventListener('click',function(e){var o=e.target.closest('.lang-opt');` +
  `if(o){try{localStorage.setItem('locale',o.getAttribute('data-loc'));}catch(_){}return;}` +
  `e.preventDefault();sw.classList.toggle('open');});` +
  `document.addEventListener('click',function(e){if(!sw.contains(e.target))sw.classList.remove('open');});` +
  `}catch(e){}})();</script>`;

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

// Cache-buster for the stylesheet: use its mtime so every edit forces browsers to
// reload styles.css instead of serving a stale cached copy.
let cssV = "1";
try { cssV = String(Math.floor(statSync(join(SITE, "styles.css")).mtimeMs)); } catch (_) {}

// The rendered English page doubles as the source of the shared chrome (nav + footer)
// reused by the blog pages, so there is exactly one copy of that markup.
let EN_HTML = "";

for (const code of Object.keys(LOCALES)) {
  const strings = flatten(JSON.parse(readFileSync(join(SRC, "i18n", `${code}.json`), "utf8")));
  let html = template;

  // 1) content placeholders
  for (const [key, val] of Object.entries(strings)) {
    html = html.split(`{{${key}}}`).join(val);
  }
  // Staging: swap the indexing meta for noindex so crawlers never index this host.
  if (ENV.noindex) {
    html = html.replace('content="index, follow, max-image-preview:large"', 'content="noindex, nofollow"');
  }
  // 2) build placeholders
  html = html
    .split("{{__lang}}").join(LOCALES[code].bcp47)
    .split("{{__base}}").join(BASE)
    .split("{{__host}}").join(HOST)
    .split("{{__analytics}}").join(analytics())
    .split("{{__autodetect}}").join(autoDetect(code))
    .split("{{__locale_js}}").join(localeJs(code))
    .split("{{__head_alts}}").join(headAlts())
    .split("{{__lang_switcher}}").join(langSwitcher(code))
    .split('href="/styles.css"').join(`href="/styles.css?v=${cssV}"`);

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

  if (code === "en") EN_HTML = html;

  const outPath = code === "en" ? join(SITE, "index.html") : join(SITE, code, "index.html");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html, "utf8");
  console.log(`✓ ${code.padEnd(3)} → ${outPath.replace(SITE + "/", ENV.out + "/")}`);
}

// ============================================================================
// Blog — English only (the 7-locale setup covers the landing page, not posts).
//   blog/posts/<slug>.md  ->  <out>/blog/<slug>/index.html
//                             <out>/blog/index.html   (list, newest first)
// Files whose name starts with "_" are templates/drafts: never rendered, never listed.
// Format + front matter spec: marketing/README.md, section "Blog (English only)".
// ============================================================================

const POSTS_DIR = join(ROOT, "blog", "posts");
const ASSETS_DIR = join(ROOT, "blog", "assets");
const blogUrl = (slug) => (slug ? `${BASE}/blog/${slug}/` : `${BASE}/blog/`);

// Blog-only stylesheet, written next to the generated pages. It rides on the tokens
// declared in the hand-maintained site/styles.css, which the blog pages load first.
// The marketing site is light-only (no dark palette anywhere in styles.css), so the
// blog is too; `<meta name="color-scheme" content="light">` keeps browsers that force
// a dark rendering from inverting the pages into something unreadable.
const BLOG_CSS = `/* BiBoTracking blog — generated by build.mjs. Do not hand-edit. */
.bl-wrap { width: 100%; max-width: 760px; margin: 0 auto; padding: 48px 24px 72px; }
.bl-back { display: inline-block; font-size: 14px; font-weight: 600; color: var(--accent); text-decoration: none; margin-bottom: 26px; }
.bl-back:hover { text-decoration: underline; }

.bl-head { margin-bottom: 40px; }
.bl-kicker { display: inline-block; font-size: 12px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; color: var(--accent); margin-bottom: 12px; }
.bl-head h1 { font-size: clamp(30px, 5vw, 42px); line-height: 1.12; letter-spacing: -.025em; color: var(--ink); margin: 0 0 12px; }
.bl-head p { font-size: 17px; line-height: 1.65; color: var(--muted); margin: 0; }

.bl-list { display: grid; gap: 14px; }
.bl-card { display: flex; flex-direction: column; gap: 7px; padding: 22px 24px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-card); text-decoration: none; transition: border-color .15s ease, box-shadow .15s ease, transform .15s ease; }
.bl-card:hover { border-color: var(--accent); box-shadow: var(--shadow-sm); transform: translateY(-1px); }
.bl-card__date { font-size: 13px; font-weight: 600; color: var(--muted); }
.bl-card__title { font-size: 20px; font-weight: 700; line-height: 1.3; letter-spacing: -.015em; color: var(--ink); }
.bl-card--lg .bl-card__title { font-size: 22px; }
.bl-card__desc { font-size: 15px; line-height: 1.6; color: var(--ink-soft); }

.bl-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.bl-tag { font-size: 11.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--text-brand); background: var(--accent-weak); border-radius: 999px; padding: 4px 10px; }

.bl-post__head { margin-bottom: 28px; }
.bl-post__head h1 { font-size: clamp(30px, 5vw, 44px); line-height: 1.1; letter-spacing: -.028em; color: var(--ink); margin: 14px 0 12px; }
.bl-post__lede { font-size: 18px; line-height: 1.65; color: var(--ink-soft); margin: 0 0 16px; }
.bl-meta { font-size: 14px; color: var(--muted); margin: 0; }
.bl-cover { width: 100%; height: auto; border-radius: var(--radius); border: 1px solid var(--border); margin-bottom: 28px; }

.bl-body { font-size: 17px; line-height: 1.75; color: var(--ink-soft); }
.bl-body h2 { font-size: 26px; line-height: 1.25; letter-spacing: -.02em; color: var(--ink); margin: 42px 0 12px; }
.bl-body h3 { font-size: 20px; line-height: 1.3; color: var(--ink); margin: 30px 0 10px; }
.bl-body p { margin: 0 0 18px; }
.bl-body ul, .bl-body ol { margin: 0 0 18px; padding-left: 24px; }
.bl-body li { margin: 7px 0; }
.bl-body a { color: var(--accent); }
.bl-body strong { color: var(--ink); }
.bl-body img { max-width: 100%; height: auto; border-radius: var(--radius-sm); border: 1px solid var(--border); margin: 10px 0; }
.bl-body code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .88em; background: var(--surface-sunken); border: 1px solid var(--border); border-radius: 5px; padding: 1.5px 5px; }
.bl-body pre { background: var(--surface-sunken); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 16px 18px; overflow-x: auto; margin: 0 0 20px; }
.bl-body pre code { background: none; border: 0; padding: 0; font-size: 13.5px; line-height: 1.6; }
.bl-body blockquote { margin: 0 0 20px; padding: 2px 0 2px 18px; border-left: 3px solid var(--accent); color: var(--muted); }
.bl-body blockquote p:last-child { margin-bottom: 0; }
.bl-body hr { border: 0; border-top: 1px solid var(--border); margin: 34px 0; }

.bl-related { margin-top: 56px; padding-top: 32px; border-top: 1px solid var(--border); }
.bl-related h2 { font-size: 20px; letter-spacing: -.015em; color: var(--ink); margin: 0 0 16px; }
.bl-related__list { display: grid; gap: 12px; }

.bl-cta { margin-top: 48px; padding: 30px 28px; text-align: center; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg-subtle); }
.bl-cta h2 { font-size: 22px; letter-spacing: -.015em; color: var(--ink); margin: 0 0 8px; }
.bl-cta p { font-size: 15px; color: var(--muted); margin: 0 0 18px; }

@media (max-width: 640px) {
  .bl-wrap { padding: 32px 18px 56px; }
  .bl-body { font-size: 16.5px; }
}
`;

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";

// --- front matter ------------------------------------------------------------
// Only the subset of YAML the post format uses: `key: value` scalars and
// `key: [a, b]` inline lists. Quotes around a scalar are optional.
function parseFrontMatter(raw, file) {
  const m = raw.replace(/^﻿/, "").match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error(`[blog] ${file}: missing front matter (--- … ---)`);
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const i = line.indexOf(":");
    if (i < 0) throw new Error(`[blog] ${file}: bad front matter line: ${line}`);
    const key = line.slice(0, i).trim();
    const val = line.slice(i + 1).trim();
    meta[key] = /^\[.*\]$/.test(val)
      ? val.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean)
      : val.replace(/^["']|["']$/g, "");
  }
  return { meta, body: m[2] };
}

// --- markdown ----------------------------------------------------------------
// Deliberately small: headings, paragraphs, lists, fenced code, blockquotes,
// rules, links, images, bold/italic/inline code. That is the whole body
// convention documented in README.md — no plugin surface, no dependency.
function inlineMd(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => `<img src="${src}" alt="${alt}" loading="lazy" />`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) =>
    /^https?:\/\//.test(href)
      ? `<a href="${href}" target="_blank" rel="noopener">${t}</a>`
      : `<a href="${href}">${t}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[Number(i)])}</code>`);
}

function markdown(src) {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let para = [];
  const flush = () => { if (para.length) { out.push(`<p>${inlineMd(para.join(" "))}</p>`); para = []; } };
  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flush();
      const lang = line.slice(3).trim().replace(/[^a-z0-9+-]/gi, "");
      const code = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) code.push(lines[i]);
      i++;
      out.push(`<pre><code${lang ? ` class="language-${lang}"` : ""}>${esc(code.join("\n"))}</code></pre>`);
      continue;
    }
    if (!line.trim()) { flush(); i++; continue; }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flush();
      const lvl = Math.max(2, h[1].length); // the <h1> comes from the front matter title
      out.push(`<h${lvl} id="${slugify(h[2])}">${inlineMd(h[2].trim())}</h${lvl}>`);
      i++; continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flush(); out.push("<hr />"); i++; continue; }
    if (/^>\s?/.test(line)) {
      flush();
      const q = [];
      for (; i < lines.length && /^>\s?/.test(lines[i]); i++) q.push(lines[i].replace(/^>\s?/, ""));
      out.push(`<blockquote>${markdown(q.join("\n"))}</blockquote>`);
      continue;
    }
    if (/^([-*]|\d+\.)\s+/.test(line)) {
      flush();
      const ordered = /^\d+\.\s+/.test(line);
      const bullet = ordered ? /^\d+\.\s+/ : /^[-*]\s+/;
      const items = [];
      while (i < lines.length && bullet.test(lines[i])) {
        let text = lines[i].replace(bullet, "");
        for (i++; i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i]); i++) {
          text += " " + lines[i].trim();
        }
        items.push(`<li>${inlineMd(text)}</li>`);
      }
      out.push(`<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }
    para.push(line.trim());
    i++;
  }
  flush();
  return out.join("\n");
}

// --- shared chrome -----------------------------------------------------------
// Lift the nav + footer out of the rendered English page so the blog can never
// drift from the landing page. In-page anchors (#pricing) must point back home.
function lift(re, what) {
  const m = EN_HTML.match(re);
  if (!m) throw new Error(`[blog] could not lift the ${what} out of the rendered English page`);
  return m[0]
    .split('href="#top"').join('href="/"')
    .replace(/href="#/g, 'href="/#');
}
const NAV_HTML = () =>
  lift(/<nav class="lp-nav"[\s\S]*?<\/nav>\s*<div class="lp-nav__scrim"[^>]*><\/div>/, "nav")
    .replace('class="lp-navlink" href="/blog/"', 'class="lp-navlink" href="/blog/" aria-current="page"');
const FOOTER_HTML = () => lift(/<footer class="lp-footer">[\s\S]*?<\/footer>/, "footer");

// Sticky-nav shadow + mobile burger, the two behaviours the shared chrome needs.
const BLOG_JS =
  `<script>(function(){var n=document.getElementById('nav');if(!n)return;` +
  `var s=function(){n.classList.toggle('scrolled',window.scrollY>8)};s();` +
  `window.addEventListener('scroll',s,{passive:true});` +
  `var b=document.getElementById('navburger');if(!b)return;` +
  `var o=function(v){n.classList.toggle('open',v);b.setAttribute('aria-expanded',v?'true':'false')};` +
  `b.addEventListener('click',function(e){e.stopPropagation();o(!n.classList.contains('open'))});` +
  `document.querySelectorAll('#navmenu a').forEach(function(a){a.addEventListener('click',function(){o(false)})});` +
  `document.addEventListener('click',function(e){if(n.classList.contains('open')&&!n.contains(e.target))o(false)});` +
  `document.addEventListener('keydown',function(e){if(e.key==='Escape')o(false)});` +
  `})();</script>`;

function blogShell({ title, description, canonical, image, ogType, jsonld, main }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <meta name="author" content="BiBoTracking" />
  <meta name="robots" content="${ENV.noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large"}" />
  <meta name="theme-color" content="#2d6cdf" />
  <meta name="color-scheme" content="light" />
  <link rel="canonical" href="${canonical}" />
  <link rel="alternate" hreflang="en" href="${canonical}" />
  <link rel="icon" type="image/png" href="/assets/favicon.png" />
  <link rel="apple-touch-icon" href="/assets/app-icon.png" />

  <meta property="og:type" content="${ogType}" />
  <meta property="og:site_name" content="BiBoTracking" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:image:alt" content="${esc(title)}" />
  <meta property="og:locale" content="en_US" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${image}" />
  <meta name="twitter:image:alt" content="${esc(title)}" />

  <script type="application/ld+json">
${JSON.stringify(jsonld, null, 2)}
  </script>

  <link rel="stylesheet" href="/styles.css?v=${cssV}" />
  <link rel="stylesheet" href="/blog/blog.css?v=${cssV}" />
${analytics()}
</head>
<body>
  ${NAV_HTML()}

${main}

  ${FOOTER_HTML()}
  ${BLOG_JS}
  ${localeJs("en")}
</body>
</html>
`;
}

// --- load + render -----------------------------------------------------------
let postFiles = [];
try {
  postFiles = readdirSync(POSTS_DIR).filter((f) => f.endsWith(".md") && !f.startsWith("_"));
} catch (_) {
  postFiles = []; // no blog/posts yet — nothing to render
}

const fmtDate = (d) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
  });

const posts = postFiles
  .map((file) => {
    const slug = file.replace(/\.md$/, "");
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
      throw new Error(`[blog] ${file}: slug must be lowercase a-z, 0-9 and hyphens`);
    }
    const { meta, body } = parseFrontMatter(readFileSync(join(POSTS_DIR, file), "utf8"), file);
    for (const k of ["title", "description", "date", "updated", "tags", "focus_keyword"]) {
      if (!meta[k] || (Array.isArray(meta[k]) && !meta[k].length)) {
        throw new Error(`[blog] ${file}: front matter is missing "${k}"`);
      }
    }
    const words = body.replace(/```[\s\S]*?```/g, " ").split(/\s+/).filter(Boolean).length;
    return {
      slug, file, body,
      title: meta.title,
      description: meta.description,
      date: meta.date,
      updated: meta.updated,
      tags: Array.isArray(meta.tags) ? meta.tags : [meta.tags],
      cover: meta.cover || "",
      readingMin: Math.max(1, Math.round(words / 200)),
    };
  })
  .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug < b.slug ? -1 : 1));

if (posts.length) {
  mkdirSync(join(SITE, "blog"), { recursive: true });
  writeFileSync(join(SITE, "blog", "blog.css"), BLOG_CSS, "utf8");

  // post images are part of the servable output
  try {
    for (const f of readdirSync(ASSETS_DIR)) {
      mkdirSync(join(SITE, "blog", "assets"), { recursive: true });
      writeFileSync(join(SITE, "blog", "assets", f), readFileSync(join(ASSETS_DIR, f)));
    }
  } catch (_) {}

  const ogFor = (p) => (p.cover ? `${BASE}${p.cover}` : `${BASE}/assets/og-image.png`);

  // Related posts: most shared tags first, then newest. Three at most.
  const related = (post) =>
    posts
      .filter((p) => p.slug !== post.slug)
      .map((p) => ({ p, shared: p.tags.filter((t) => post.tags.includes(t)).length }))
      .sort((a, b) => b.shared - a.shared || (a.p.date < b.p.date ? 1 : -1))
      .slice(0, 3)
      .map((x) => x.p);

  const tagList = (p) => p.tags.map((t) => `<span class="bl-tag">${esc(t)}</span>`).join("");

  for (const post of posts) {
    const rel = related(post);
    const relHtml = rel.length
      ? `
      <aside class="bl-related">
        <h2>Keep reading</h2>
        <div class="bl-related__list">
          ${rel.map((r) => `<a class="bl-card" href="/blog/${r.slug}/">
            <span class="bl-card__date">${fmtDate(r.date)} · ${r.readingMin} min read</span>
            <span class="bl-card__title">${esc(r.title)}</span>
            <span class="bl-card__desc">${esc(r.description)}</span>
          </a>`).join("\n          ")}
        </div>
      </aside>`
      : "";

    const main = `  <main class="bl-wrap bl-post">
    <a class="bl-back" href="/blog/">← All posts</a>
    <article>
      <header class="bl-post__head">
        <div class="bl-tags">${tagList(post)}</div>
        <h1>${esc(post.title)}</h1>
        <p class="bl-post__lede">${esc(post.description)}</p>
        <p class="bl-meta">
          <time datetime="${post.date}">${fmtDate(post.date)}</time> · ${post.readingMin} min read${
            post.updated !== post.date ? ` · updated <time datetime="${post.updated}">${fmtDate(post.updated)}</time>` : ""
          }
        </p>
      </header>
      ${post.cover ? `<img class="bl-cover" src="${post.cover}" alt="${esc(post.title)}" />` : ""}
      <div class="bl-body">
${markdown(post.body)}
      </div>
    </article>${relHtml}
    <div class="bl-cta">
      <h2>Track time without the per-seat bill</h2>
      <p>BiBoTracking is free, open source and local-first — for macOS and Windows.</p>
      <a class="lp-btn lp-btn--primary lp-btn--lg" href="/">See how it works</a>
    </div>
  </main>`;

    const html = blogShell({
      title: `${post.title} — BiBoTracking`,
      description: post.description,
      canonical: blogUrl(post.slug),
      image: ogFor(post),
      ogType: "article",
      jsonld: {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: post.title,
        description: post.description,
        image: ogFor(post),
        datePublished: post.date,
        dateModified: post.updated,
        keywords: post.tags.join(", "),
        wordCount: post.body.split(/\s+/).filter(Boolean).length,
        inLanguage: "en",
        author: { "@type": "Organization", name: "BiBoTracking", url: `${BASE}/` },
        publisher: {
          "@type": "Organization",
          name: "BiBoTracking",
          logo: { "@type": "ImageObject", url: `${BASE}/assets/app-icon.png` },
        },
        mainEntityOfPage: { "@type": "WebPage", "@id": blogUrl(post.slug) },
      },
      main,
    });
    const outPath = join(SITE, "blog", post.slug, "index.html");
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, html, "utf8");
    console.log(`✓ blog → ${ENV.out}/blog/${post.slug}/index.html`);
  }

  // /blog/ — the list, newest first.
  const listHtml = `  <main class="bl-wrap">
    <header class="bl-head">
      <span class="bl-kicker">Blog</span>
      <h1>Time tracking, without the surveillance tax</h1>
      <p>Practical notes on employee time tracking, remote work and the tools around them — from the team building BiBoTracking.</p>
    </header>
    <div class="bl-list">
      ${posts.map((p) => `<a class="bl-card bl-card--lg" href="/blog/${p.slug}/">
        <span class="bl-card__date"><time datetime="${p.date}">${fmtDate(p.date)}</time> · ${p.readingMin} min read</span>
        <span class="bl-card__title">${esc(p.title)}</span>
        <span class="bl-card__desc">${esc(p.description)}</span>
        <span class="bl-tags">${tagList(p)}</span>
      </a>`).join("\n      ")}
    </div>
  </main>`;

  writeFileSync(
    join(SITE, "blog", "index.html"),
    blogShell({
      title: "Blog — BiBoTracking",
      description:
        "Practical notes on employee time tracking, remote work and monitoring tools, from the team building BiBoTracking.",
      canonical: blogUrl(""),
      image: `${BASE}/assets/og-image.png`,
      ogType: "website",
      jsonld: {
        "@context": "https://schema.org",
        "@type": "Blog",
        name: "BiBoTracking Blog",
        url: blogUrl(""),
        inLanguage: "en",
        publisher: { "@type": "Organization", name: "BiBoTracking", url: `${BASE}/` },
        blogPost: posts.map((p) => ({
          "@type": "BlogPosting",
          headline: p.title,
          description: p.description,
          datePublished: p.date,
          dateModified: p.updated,
          url: blogUrl(p.slug),
        })),
      },
      main: listHtml,
    }),
    "utf8",
  );
  console.log(`✓ blog → ${ENV.out}/blog/index.html (${posts.length} post${posts.length === 1 ? "" : "s"})`);
} else {
  console.log("· blog: no posts in blog/posts/ — nothing rendered");
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
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${c === "en" ? "1.0" : "0.9"}</priority>
${altLinks}
  </url>`,
  )
  .join("\n");
// Blog URLs — English only, so no hreflang alternates. lastmod comes from the
// post's `updated` (falling back to `date`); /blog/ uses the newest of those.
const postMod = (p) => p.updated || p.date;
const blogUrls = posts.length
  ? [
      `  <url>
    <loc>${blogUrl("")}</loc>
    <lastmod>${posts.map(postMod).sort().slice(-1)[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`,
      ...posts.map(
        (p) => `  <url>
    <loc>${blogUrl(p.slug)}</loc>
    <lastmod>${postMod(p)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`,
      ),
    ].join("\n")
  : "";

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}${blogUrls ? "\n" + blogUrls : ""}
</urlset>
`;
writeFileSync(join(SITE, "sitemap.xml"), sitemap, "utf8");
console.log("✓ sitemap.xml");

// robots.txt — welcomes search + AI crawlers on prod; staging blocks everything.
const robots = ENV.noindex
  ? `# Staging environment — do not crawl or index.
User-agent: *
Disallow: /
`
  : `# Search engines and AI / answer-engine crawlers are welcome to crawl and cite
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
