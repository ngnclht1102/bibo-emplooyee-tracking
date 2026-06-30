import { useEffect, useState } from "react";
import { call as invoke } from "../api";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { Card } from "../ui";

type Visit = {
  ts: number;
  url: string;
  page_title: string | null;
  browser: string | null;
  duration_s: number;
};

type BrowserLinkInfo = { port: number | null; token_active: boolean };

// Where the "Get the extension" button points. Chrome-only for now; published
// page can be swapped without code changes elsewhere.
const EXTENSION_URL = "https://bibotracker.com/extension";

/**
 * ExtensionGuide — shown on the Browser screen until the extension has reported
 * its first page visit. Walks the user through installing the Chrome extension;
 * the desktop auto-connects via the local /whoami handshake (see docs/04).
 */
function ExtensionGuide({ port }: { port: number | null }) {
  const { t } = useTranslation("media");
  return (
    <Card>
      <h2 style={{ marginTop: 0 }}>{t("browser.title")}</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        {t("browser.subtitle")}
      </p>

      <div className="row" style={{ alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div className="gif-slot" style={{ width: 240 }}>
          {t("browser.gifPlaceholder")}
        </div>
        <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
          <li>{t("browser.step1")}</li>
          <li>
            {t("browser.step2Prefix")}
            <button className="signout" onClick={() => openUrl(EXTENSION_URL).catch(() => {})}>
              {t("browser.getExtension")}
            </button>
          </li>
          <li>{t("browser.step3")}</li>
          <li>{t("browser.step4")}</li>
        </ol>
      </div>

      <div className="notice notice-info" style={{ marginTop: 16 }}>
        <span>
          {t("browser.waiting")}
          {port ? t("browser.waitingPort", { port }) : ""}
        </span>
      </div>

      <div className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        {t("browser.support")}
      </div>
    </Card>
  );
}

function startOfTodayTs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Compact duration for the table column: hours+minutes, else minutes, else seconds.
function fmtDur(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${secs}s`;
}

function hhmm(ts: number) {
  const d = new Date(ts * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Stable accent colour per domain, drawn from the dashboard data palette so the
// favicon tiles look consistent across reloads (no random reshuffling).
const FAV_COLORS = [
  "--data-lavender",
  "--data-mint",
  "--data-sky",
  "--data-amber",
  "--data-teal",
  "--data-rose",
];
function favColor(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `var(${FAV_COLORS[h % FAV_COLORS.length]})`;
}

export function Browser() {
  const { t } = useTranslation("media");
  const [visits, setVisits] = useState<Visit[]>([]);
  const [port, setPort] = useState<number | null>(null);

  useEffect(() => {
    invoke<BrowserLinkInfo>("browser_link")
      .then((l) => setPort(l.port))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const rows = await invoke<Visit[]>("browser_visits", {
          fromTs: startOfTodayTs(),
          toTs: Math.floor(Date.now() / 1000) + 1,
        });
        if (alive) setVisits(rows);
      } catch {
        /* ignore */
      }
    };
    load();
    const id = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Group visits by hostname → one row per site. Track total time, the earliest
  // visit (the "Time" column) and a representative browser. Sorted by time spent.
  type SiteRow = { site: string; total_s: number; start: number; browser: string | null };
  const bySite = new Map<string, SiteRow>();
  for (const v of visits) {
    const site = hostOf(v.url);
    const cur = bySite.get(site);
    if (cur) {
      cur.total_s += v.duration_s;
      if (v.ts < cur.start) cur.start = v.ts;
      if (!cur.browser && v.browser) cur.browser = v.browser;
    } else {
      bySite.set(site, { site, total_s: v.duration_s, start: v.ts, browser: v.browser });
    }
  }
  const rows = [...bySite.values()].sort((a, b) => b.total_s - a.total_s);

  // Until the extension reports its first visit, show the install guide instead of
  // an empty table — the practical "is the extension connected?" signal.
  if (visits.length === 0) {
    return <ExtensionGuide port={port} />;
  }

  return (
    <div className="bb-browser">
      <Card>
        <div className="bb-panel__head">
          <div>
            <div className="bb-panel__title">{t("browser.visitedTitle")}</div>
            <div className="bb-panel__sub">{t("browser.visitedSub")}</div>
          </div>
          <span className="bb-live" style={{ marginLeft: "auto" }}>
            <span className="bb-live__dot" />
            {t("browser.live")}
          </span>
        </div>

        <table className="bb-tbl">
          <thead>
            <tr>
              <th>{t("browser.colDomain")}</th>
              <th>{t("browser.colStart")}</th>
              <th className="r">{t("browser.colDuration")}</th>
              <th>{t("browser.colBrowser")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.site}>
                <td>
                  <div className="bb-tbl__domain">
                    <span className="bb-tbl__fav" style={{ backgroundColor: favColor(r.site) }}>
                      {r.site.charAt(0).toUpperCase()}
                    </span>
                    {r.site}
                  </div>
                </td>
                <td className="bb-tbl__time">{hhmm(r.start)}</td>
                <td className="r bb-tbl__dur">{fmtDur(r.total_s)}</td>
                <td>
                  <span className="bb-muted" style={{ fontWeight: 600 }}>
                    {r.browser || "—"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
