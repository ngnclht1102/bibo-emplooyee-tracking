import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { Card, BarRow, SectionTitle } from "../ui";

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
const EXTENSION_URL = "https://employeetracking.namnguyen.pro/extension";

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

function fmt(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

function hhmm(ts: number) {
  const d = new Date(ts * 1000);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
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

  // Top sites by total time (aggregate by hostname).
  const bySite = new Map<string, number>();
  for (const v of visits) {
    const h = hostOf(v.url);
    bySite.set(h, (bySite.get(h) ?? 0) + v.duration_s);
  }
  const topSites = [...bySite.entries()]
    .map(([site, total_s]) => ({ site, total_s }))
    .sort((a, b) => b.total_s - a.total_s)
    .slice(0, 8);
  const maxSite = topSites[0]?.total_s ?? 1;

  // Until the extension reports its first visit, show the install guide instead of
  // an empty table — the practical "is the extension connected?" signal.
  if (visits.length === 0) {
    return <ExtensionGuide port={port} />;
  }

  return (
    <>
      <SectionTitle>{t("browser.topSites")}</SectionTitle>
      <Card>
        {topSites.map((s) => (
          <BarRow
            key={s.site}
            label={s.site}
            value={fmt(s.total_s)}
            pct={(s.total_s / maxSite) * 100}
          />
        ))}
      </Card>

      <SectionTitle>{t("browser.pageVisits")}</SectionTitle>
      <Card style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>{t("browser.colPage")}</th>
              <th>{t("browser.colSite")}</th>
              <th style={{ textAlign: "right" }}>{t("browser.colTime")}</th>
              <th style={{ textAlign: "right" }}>{t("browser.colWhen")}</th>
            </tr>
          </thead>
          <tbody>
            {visits.map((v, i) => (
              <tr key={i}>
                <td>{v.page_title || v.url}</td>
                <td className="muted">{hostOf(v.url)}</td>
                <td className="num" style={{ textAlign: "right" }}>
                  {fmt(v.duration_s)}
                </td>
                <td className="num muted" style={{ textAlign: "right" }}>
                  {hhmm(v.ts)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
