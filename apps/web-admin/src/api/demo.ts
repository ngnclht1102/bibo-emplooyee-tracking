// ─────────────────────────────────────────────────────────────────────
// Dev-only DEMO data. Lets the dashboard/detail pages show realistic stats
// with no backend or database. Deterministic (seeded) so numbers are stable
// across reloads — no flicker.
//
//   Enable:  open …/admin/?demo=1   (or run  localStorage.demo="1"  in console)
//   Disable: open …/admin/?demo=0   (or run  delete localStorage.demo)
//
// Gated behind import.meta.env.DEV, so it is inert in any production build.
// This file adds NO business logic — endpoints.ts just short-circuits to it
// when the flag is on, and behaves exactly as before when it is off.
// ─────────────────────────────────────────────────────────────────────
import type {
  ActivityResponse,
  BrowserVisit,
  Business,
  Employee,
  KeystrokeBucket,
  ReportEmployee,
  ScreenshotMeta,
  ScreenshotsResponse,
} from "./types";

export function isDemo(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    const q = new URLSearchParams(window.location.search).get("demo");
    if (q === "1") localStorage.setItem("demo", "1");
    if (q === "0") localStorage.removeItem("demo");
    return localStorage.getItem("demo") === "1";
  } catch {
    return false;
  }
}

const HOUR = 3600;
const nowS = () => Math.floor(Date.now() / 1000);
const dayStart = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
};

/** Stable pseudo-random generator in [0,1) from a string seed. */
function seeded(s: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    return ((h >>> 0) % 100000) / 100000;
  };
}

export const DEMO_BUSINESS_ID = "demo-family";

export const demoBusinesses: Business[] = [
  {
    id: DEMO_BUSINESS_ID,
    name: "The Tran Family",
    kind: "family",
    owner_user_id: "demo-owner",
    screenshot_retention_days: 30,
    screenshot_interval_s: 300,
    idle_threshold_s: 300,
    allow_employee_override: false,
    screenshot_upload: true,
    screenshot_mode: "privacy",
    screenshot_skip_apps: [],
  },
];

// ageMin = minutes since last seen (drives active/idle/offline dot).
const MEMBERS: { id: string; name: string; login: string; role: "owner" | "employee"; ageMin: number }[] = [
  { id: "demo-owner", name: "Brian Nguyen", login: "brian@home.app", role: "owner", ageMin: 1 },
  { id: "demo-hannah", name: "Hannah Tran", login: "hannah@home.app", role: "employee", ageMin: 3 },
  { id: "demo-leo", name: "Leo Tran", login: "leo_home", role: "employee", ageMin: 18 },
  { id: "demo-mia", name: "Mia Tran", login: "mia@home.app", role: "employee", ageMin: 120 },
  { id: "demo-noah", name: "Noah Tran", login: "noah_home", role: "employee", ageMin: 4320 },
];

export function demoRoster(): ReportEmployee[] {
  return MEMBERS.map((m) => {
    const r = seeded(m.id);
    const active = Math.round((2.5 + r() * 6) * HOUR); // 2.5–8.5h
    const isEmail = m.login.includes("@");
    return {
      id: m.id,
      display_name: m.name,
      email: isEmail ? m.login : "",
      username: isEmail ? undefined : m.login,
      role: m.role,
      last_seen: nowS() - m.ageMin * 60,
      active_today_s: active,
      active_yesterday_s: Math.round(active * (0.7 + r() * 0.6)),
      screenshots_today: 8 + Math.round(r() * 20),
      screenshots_yesterday: 8 + Math.round(r() * 20),
      focus_pct_today: 55 + Math.round(r() * 33),
    };
  });
}

export function demoEmployees(): Employee[] {
  return MEMBERS.map((m) => ({
    id: m.id,
    display_name: m.name,
    email: m.login.includes("@") ? m.login : "",
    username: m.login.includes("@") ? undefined : m.login,
  }));
}

const APPS = ["VS Code", "Figma", "Chrome", "Slack", "Notion", "Terminal", "Zoom", "Spotify"];

export function demoActivity(employeeId: string): ActivityResponse {
  const r = seeded(employeeId + ":activity");
  const count = 5 + Math.floor(r() * 2); // 5–6 apps
  const offset = Math.floor(r() * APPS.length);
  const chosen = Array.from({ length: count }, (_, i) => APPS[(offset + i) % APPS.length]);

  const base = 3200 + Math.floor(r() * 3200);
  const breakdown = chosen.map((app, i) => ({
    app_name: app,
    duration_s: Math.max(600, Math.round(base * Math.pow(0.68, i))),
  }));

  // Samples across a working day (08:00 → ~18:00) with idle gaps between them.
  const samples: ActivityResponse["samples"] = [];
  const end = dayStart() + 18 * HOUR;
  let t = dayStart() + 8 * HOUR + Math.floor(r() * HOUR * 0.5);
  while (t < end) {
    const app = chosen[Math.floor(r() * chosen.length)];
    const dur = Math.round((15 + r() * 70) * 60); // 15–85 min
    samples.push({ ts: t, app_name: app, window_title: `${app} — window`, duration_s: dur });
    t += dur + Math.round(r() * 25 * 60); // gap 0–25 min
  }
  return { samples, breakdown };
}

export function demoKeystrokes(employeeId: string): { buckets: KeystrokeBucket[] } {
  const r = seeded(employeeId + ":keys");
  const buckets: KeystrokeBucket[] = [];
  // 30-minute buckets, 08:00 → 17:30
  for (let m = 8 * 60; m <= 17 * 60 + 30; m += 30) {
    buckets.push({ ts_bucket: dayStart() + m * 60, count: 200 + Math.round(r() * 1200) });
  }
  return { buckets };
}

const SITES: [string, string][] = [
  ["github.com", "GitHub — pull requests"],
  ["figma.com", "Figma — Design file"],
  ["stackoverflow.com", "Stack Overflow"],
  ["linear.app", "Linear — Issues"],
  ["developer.mozilla.org", "MDN Web Docs"],
  ["notion.so", "Notion — Notes"],
  ["youtube.com", "YouTube"],
  ["news.ycombinator.com", "Hacker News"],
];

export function demoBrowser(employeeId: string): { visits: BrowserVisit[] } {
  const r = seeded(employeeId + ":web");
  const browsers = ["Chrome", "Arc"];
  // one visit per distinct domain
  const visits: BrowserVisit[] = SITES.map(([url, title]) => ({
    ts: dayStart() + (8 + Math.floor(r() * 9)) * HOUR + Math.floor(r() * HOUR),
    url: `https://${url}`,
    page_title: title,
    browser: browsers[Math.floor(r() * browsers.length)],
    duration_s: Math.round((8 + r() * 60) * 60),
  }));
  return { visits };
}

const SHOT_APPS = [
  "VS Code", "VS Code", "Chrome", "Figma", "Figma", "VS Code", "VS Code", "Terminal",
  "Chrome", "VS Code", "VS Code", "Notion", "Slack", "Figma", "VS Code", "Chrome",
  "VS Code", "Figma", "VS Code", "Terminal", "Notion", "Figma",
];
export function demoScreenshots(employeeId: string): ScreenshotsResponse {
  const r = seeded(employeeId + ":shots");
  const n = 22;
  const start = dayStart() + 8 * HOUR + 12 * 60;
  // app carried alongside the meta so the gallery can badge each card
  const screenshots: (ScreenshotMeta & { app: string })[] = Array.from({ length: n }, (_, i) => ({
    client_uuid: `demo-${employeeId}-${i}`,
    ts: start + i * (10 * 60 + 7),
    byte_size: 120000 + Math.round(r() * 400000),
    width: 2560,
    height: 1440,
    display_id: 0,
    app: SHOT_APPS[i % SHOT_APPS.length],
  }));
  return { screenshots, limit: 60, offset: 0 };
}
