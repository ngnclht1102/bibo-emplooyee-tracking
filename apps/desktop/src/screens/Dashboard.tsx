import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { Card, StatCard, BarRow, SectionTitle } from "../ui";

type AppTotal = { app_name: string; total_s: number };
type Seg = { ts: number; app_name: string; duration_s: number };
type DashboardData = {
  total_active_s: number;
  top_app: string | null;
  by_app: AppTotal[];
  timeline: Seg[];
  keypresses: number;
  screenshots: number;
};

function fmt(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

function startOfTodayTs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

// Build a left-to-right timeline over [dayStart, now], inserting idle gaps.
type Band = { kind: "active" | "idle"; app?: string; secs: number };
function buildBands(timeline: Seg[], dayStart: number, now: number): Band[] {
  const bands: Band[] = [];
  let cursor = dayStart;
  for (const s of timeline) {
    if (s.ts > cursor) bands.push({ kind: "idle", secs: s.ts - cursor });
    bands.push({ kind: "active", app: s.app_name, secs: s.duration_s });
    cursor = Math.max(cursor, s.ts + s.duration_s);
  }
  if (now > cursor) bands.push({ kind: "idle", secs: now - cursor });
  return bands.filter((b) => b.secs > 0);
}

// Distinct apps get distinct opacities of the accent (no rainbow).
function opacityFor(app: string, rank: Map<string, number>) {
  const r = rank.get(app) ?? 0;
  return Math.max(0.35, 0.95 - r * 0.13);
}

export function Dashboard() {
  const { t } = useTranslation("screens");
  const [data, setData] = useState<DashboardData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const from = startOfTodayTs();
        const to = Math.floor(Date.now() / 1000) + 1;
        const d = await invoke<DashboardData>("dashboard_data", {
          fromTs: from,
          toTs: to,
        });
        if (alive) {
          setData(d);
          setErr(null);
        }
      } catch (e) {
        if (alive) setErr(String(e));
      }
    };
    load();
    const id = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (err) return <Card>{t("dashboard.loadFailed", { error: err })}</Card>;
  if (!data) return <Card>{t("dashboard.loading")}</Card>;

  const dayStart = startOfTodayTs();
  const now = Math.floor(Date.now() / 1000) + 1;
  const span = Math.max(1, now - dayStart);
  const bands = buildBands(data.timeline, dayStart, now);

  const rank = new Map<string, number>();
  data.by_app.forEach((a, i) => rank.set(a.app_name, i));
  const maxApp = data.by_app[0]?.total_s ?? 1;

  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <StatCard label={t("dashboard.activeTimeToday")} value={fmt(data.total_active_s)} />
        <StatCard label={t("dashboard.topApp")} value={data.top_app ?? "—"} />
        <StatCard label={t("dashboard.keypresses")} value={data.keypresses.toLocaleString()} />
        <StatCard label={t("dashboard.screenshots")} value={String(data.screenshots)} />
      </div>

      <SectionTitle>{t("dashboard.timelineTitle")}</SectionTitle>
      <Card>
        {bands.length === 0 ? (
          <div className="muted" style={{ fontSize: 12 }}>
            {t("dashboard.timelineEmpty")}
          </div>
        ) : (
          <>
            <div className="timeline">
              {bands.map((b, i) => (
                <div
                  key={i}
                  className={`timeline-seg ${b.kind === "idle" ? "timeline-idle" : ""}`}
                  title={
                    b.kind === "idle"
                      ? `${t("dashboard.idle")} · ${fmt(b.secs)}`
                      : `${b.app} · ${fmt(b.secs)}`
                  }
                  style={{
                    width: `${(b.secs / span) * 100}%`,
                    background: b.kind === "idle" ? undefined : "var(--accent)",
                    opacity: b.kind === "idle" ? 1 : opacityFor(b.app!, rank),
                  }}
                />
              ))}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              {t("dashboard.timelineCaption")}
            </div>
          </>
        )}
      </Card>

      <SectionTitle>{t("dashboard.appBreakdownTitle")}</SectionTitle>
      <Card>
        {data.by_app.length === 0 ? (
          <div className="muted" style={{ fontSize: 12 }}>
            {t("dashboard.appBreakdownEmpty")}
          </div>
        ) : (
          data.by_app.map((a) => (
            <BarRow
              key={a.app_name}
              label={a.app_name}
              value={fmt(a.total_s)}
              pct={(a.total_s / maxApp) * 100}
            />
          ))
        )}
      </Card>
    </>
  );
}
