import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Card, BarRow, SectionTitle } from "../ui";

type Visit = {
  ts: number;
  url: string;
  page_title: string | null;
  browser: string | null;
  duration_s: number;
};

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
  const [visits, setVisits] = useState<Visit[]>([]);

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

  if (visits.length === 0) {
    return (
      <Card>
        <div className="muted" style={{ fontSize: 12 }}>
          No browser activity yet today. Load the Employee Tracker browser extension
          (apps/extension) and browse — visits appear here.
        </div>
      </Card>
    );
  }

  return (
    <>
      <SectionTitle>Top sites by time</SectionTitle>
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

      <SectionTitle>Page visits</SectionTitle>
      <Card style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Page</th>
              <th>Site</th>
              <th style={{ textAlign: "right" }}>Time</th>
              <th style={{ textAlign: "right" }}>When</th>
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
