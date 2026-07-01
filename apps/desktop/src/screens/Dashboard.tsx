import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { call as invoke } from "../api";
import { Card, StatCard } from "../ui";

/* ---- stat-card icons (stroke = currentColor) ---- */
const ico = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;
const ClockIcon = () => (
  <svg {...ico} aria-hidden><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
);
const AppWindowIcon = () => (
  <svg {...ico} aria-hidden><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M10 4v4" /><path d="M2 8h20" /><path d="M6 4v4" /></svg>
);
const KeyboardIcon = () => (
  <svg {...ico} aria-hidden><path d="M10 8h.01" /><path d="M12 12h.01" /><path d="M14 8h.01" /><path d="M16 12h.01" /><path d="M18 8h.01" /><path d="M6 8h.01" /><path d="M7 16h10" /><path d="M8 12h.01" /><rect width="20" height="16" x="2" y="4" rx="2" /></svg>
);
const CameraIcon = () => (
  <svg {...ico} aria-hidden><path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z" /><circle cx="12" cy="13" r="3" /></svg>
);

// Real hourly active-seconds buckets for today (drives the card sparklines).
function hourlyActivity(timeline: Seg[], dayStart: number, now: number): number[] {
  const hours = Math.max(2, Math.ceil((now - dayStart) / 3600));
  const buckets = new Array(hours).fill(0);
  for (const s of timeline) {
    const idx = Math.floor((s.ts - dayStart) / 3600);
    if (idx >= 0 && idx < hours) buckets[idx] += s.duration_s;
  }
  return buckets;
}

// Tiny smoothed sparkline (gradient area + line + end dot) from a value series.
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const W = 46, H = 20, P = 3;
  const n = values.length;
  if (n < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const xs = values.map((_, i) => P + (i * (W - 2 * P)) / (n - 1));
  const ys = values.map((v) => P + (H - 2 * P) * (1 - (v - min) / range));
  let d = `M ${xs[0]} ${ys[0]}`;
  for (let i = 0; i < n - 1; i++) {
    const x0 = xs[Math.max(0, i - 1)], y0 = ys[Math.max(0, i - 1)];
    const x1 = xs[i], y1 = ys[i];
    const x2 = xs[i + 1], y2 = ys[i + 1];
    const x3 = xs[Math.min(n - 1, i + 2)], y3 = ys[Math.min(n - 1, i + 2)];
    d += ` C ${x1 + (x2 - x0) / 6} ${y1 + (y2 - y0) / 6}, ${x2 - (x3 - x1) / 6} ${y2 - (y3 - y1) / 6}, ${x2} ${y2}`;
  }
  const gid = "sp-" + color.replace(/[^a-z0-9]/gi, "");
  return (
    <svg width={W} height={H} style={{ display: "block", overflow: "visible" }} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L ${xs[n - 1]} ${H} L ${xs[0]} ${H} Z`} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xs[n - 1]} cy={ys[n - 1]} r="2.6" fill={color} />
    </svg>
  );
}

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

// Per-app colour palette for the timeline (matches the web dashboard's data tones):
// each app keeps ONE hue, assigned by usage rank — never a rainbow per segment.
const DATA_COLORS = ["lavender", "mint", "sky", "amber", "teal", "rose"] as const;
function dataVar(rankIdx: number): string {
  return `var(--data-${DATA_COLORS[rankIdx % DATA_COLORS.length]})`;
}

// A left-to-right band over [winStart, winEnd]: active app runs + idle gaps.
type Band = { kind: "active" | "idle"; app?: string; start: number; secs: number };
// Real activity is logged as many short, app-switching samples — drawn 1:1 that's a
// barcode of slivers. Instead bucket the window into equal slots, colour each slot by
// the app that dominates it (or idle), then merge neighbouring same-app slots into
// wide, readable blocks (matches the mock).
const BUCKETS = 48;
function buildBands(timeline: Seg[], winStart: number, winEnd: number): Band[] {
  const span = Math.max(1, winEnd - winStart);
  const size = span / BUCKETS;
  const slots: Map<string, number>[] = Array.from({ length: BUCKETS }, () => new Map());
  for (const s of timeline) {
    const a = Math.max(s.ts, winStart);
    const b = Math.min(s.ts + s.duration_s, winEnd);
    if (b <= a) continue;
    const first = Math.floor((a - winStart) / size);
    const last = Math.min(BUCKETS - 1, Math.floor((b - winStart) / size));
    for (let i = Math.max(0, first); i <= last; i++) {
      const bs = winStart + i * size;
      const overlap = Math.min(b, bs + size) - Math.max(a, bs);
      if (overlap > 0) slots[i].set(s.app_name, (slots[i].get(s.app_name) ?? 0) + overlap);
    }
  }
  // Label each slot: dominant app if it's busy enough, else idle (null).
  const labels = slots.map((m) => {
    let app: string | null = null;
    let max = 0;
    let total = 0;
    for (const [k, v] of m) {
      total += v;
      if (v > max) {
        max = v;
        app = k;
      }
    }
    return total >= size * 0.34 ? app : null;
  });
  const bands: Band[] = [];
  for (let i = 0; i < BUCKETS; i++) {
    const lbl = labels[i];
    const prev = bands[bands.length - 1];
    const prevLbl = prev ? (prev.kind === "active" ? prev.app! : null) : undefined;
    if (prev && prevLbl === lbl) {
      prev.secs += size;
    } else if (lbl) {
      bands.push({ kind: "active", app: lbl, start: winStart + i * size, secs: size });
    } else {
      bands.push({ kind: "idle", start: winStart + i * size, secs: size });
    }
  }
  return bands;
}

// Hour-aligned axis window + evenly-spaced round-hour tick marks for the timeline.
const HOUR = 3600;
function buildAxis(winStartRaw: number, winEndRaw: number) {
  const start = Math.floor(winStartRaw / HOUR) * HOUR;
  const rawHours = Math.max(1, Math.ceil((winEndRaw - start) / HOUR));
  const step = Math.max(1, Math.ceil(rawHours / 6));
  const spanHours = Math.ceil(rawHours / step) * step;
  const end = start + spanHours * HOUR;
  const ticks: number[] = [];
  for (let h = 0; h <= spanHours; h += step) ticks.push(start + h * HOUR);
  return { start, end, ticks };
}

export function Dashboard() {
  const { t, i18n } = useTranslation("screens");
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
  const maxApp = data.by_app[0]?.total_s ?? 1;

  // Today's timeline: hour axis from the first activity → now, app runs + idle gaps.
  const firstTs = data.timeline.length
    ? Math.min(...data.timeline.map((s) => s.ts))
    : dayStart;
  const axis = buildAxis(firstTs, now);
  const axisSpan = Math.max(1, axis.end - axis.start);
  const bands = buildBands(data.timeline, axis.start, axis.end);
  const rank = new Map<string, number>();
  data.by_app.forEach((a, i) => rank.set(a.app_name, i));
  const hhmm = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  // Each app keeps one hue (solid background-color) with a translucent light→dark
  // sheen on top. Set as SEPARATE longhands — a `background` shorthand ending in
  // var() is rejected by some webviews, leaving the segment colourless.
  const segStyle = (app: string) => ({
    backgroundColor: dataVar(rank.get(app) ?? 0),
    backgroundImage:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.16), rgba(0, 0, 0, 0.16))",
  });
  // Legend = the apps actually present, each with its assigned hue (capped to the palette).
  const legend = data.by_app.slice(0, DATA_COLORS.length);

  const dateStr = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date());

  // Top app's share of total active time (real, derived from by_app).
  const topPct =
    data.total_active_s > 0 && data.by_app[0]
      ? Math.round((data.by_app[0].total_s / data.total_active_s) * 100)
      : null;

  // Real sparkline series: today's active seconds per hour.
  const spark = hourlyActivity(data.timeline, dayStart, now);

  return (
    <div className="bb-dash">
      <p className="dash-intro">
        {t("dashboard.greeting")} · <strong>{dateStr}</strong>
      </p>
      <div className="grid" style={{ gridTemplateColumns: "1.1fr 1fr 1.1fr 0.85fr" }}>
        {/* delta values are PLACEHOLDERS to match the mock — the backend doesn't
            yet return vs-yesterday comparisons. Top app's sub (%) is real (by_app). */}
        <StatCard
          focal
          icon={<ClockIcon />}
          label={t("dashboard.activeTimeToday")}
          value={fmt(data.total_active_s)}
          delta="12%"
          sub={t("dashboard.vsYesterday")}
          chart={<Sparkline values={spark} color="#9d92f7" />}
        />
        <StatCard
          icon={<AppWindowIcon />}
          label={t("dashboard.topApp")}
          value={data.top_app ?? "—"}
          delta={
            <span className="bibo-stat__delta-stack">
              3h
              <br />
              42m
            </span>
          }
          sub={topPct != null ? `${topPct}%` : undefined}
          chart={<Sparkline values={spark} color="#8b7cf0" />}
        />
        <StatCard
          icon={<KeyboardIcon />}
          label={t("dashboard.keypresses")}
          value={data.keypresses.toLocaleString()}
          delta="8%"
          sub={t("dashboard.vsYesterday")}
          chart={<Sparkline values={spark} color="#38bdf8" />}
        />
        <StatCard
          icon={<CameraIcon />}
          label={t("dashboard.screenshots")}
          value={String(data.screenshots)}
          delta="+4"
          sub={t("dashboard.today")}
          chart={<Sparkline values={spark} color="#34d399" />}
        />
      </div>

      <div className="bb-row2">
        <Card>
          <div className="bb-panel__head">
            <div>
              <div className="bb-panel__title">{t("dashboard.timelineTitle")}</div>
              <div className="bb-panel__sub">{t("dashboard.timelineSub")}</div>
            </div>
          <span className="bb-live">
            <span className="bb-live__dot" />
            {t("dashboard.live")}
          </span>
        </div>
        {bands.length === 0 ? (
          <div className="muted" style={{ fontSize: 12 }}>
            {t("dashboard.timelineEmpty")}
          </div>
        ) : (
          <>
            <div className="bb-timeline">
              {bands.map((b, i) => (
                <div
                  key={i}
                  className={`bb-timeline__seg${b.kind === "idle" ? " idle" : ""}`}
                  title={
                    b.kind === "idle"
                      ? `${t("dashboard.idle")} · ${fmt(b.secs)}`
                      : `${b.app} · ${fmt(b.secs)}`
                  }
                  style={{
                    left: `${((b.start - axis.start) / axisSpan) * 100}%`,
                    width: `${(b.secs / axisSpan) * 100}%`,
                    ...(b.kind === "active" ? segStyle(b.app!) : null),
                  }}
                />
              ))}
            </div>
            <div className="bb-timeline__axis">
              {axis.ticks.map((ts) => (
                <span key={ts}>{hhmm.format(new Date(ts * 1000))}</span>
              ))}
            </div>
            <div className="bb-timeline__cap">
              <i />
              {t("dashboard.timelineCaption")}
            </div>
            <div className="bb-legend">
              {legend.map((a) => (
                <span className="bb-legend__item" key={a.app_name}>
                  <span
                    className="bb-legend__dot"
                    style={{ backgroundColor: dataVar(rank.get(a.app_name) ?? 0) }}
                  />
                  {a.app_name}
                </span>
              ))}
            </div>
          </>
        )}
        </Card>

        <Card>
          <div className="bb-panel__head">
            <div className="bb-panel__title">{t("dashboard.appBreakdownTitle")}</div>
          </div>
          {data.by_app.length === 0 ? (
            <div className="muted" style={{ fontSize: 12 }}>
              {t("dashboard.appBreakdownEmpty")}
            </div>
          ) : (
            <div className="bb-byapp">
              {data.by_app.map((a) => (
                <div className="bb-byapp__row" key={a.app_name}>
                  <span className="bb-byapp__name" title={a.app_name}>
                    <span
                      className="bb-byapp__dot"
                      style={{ backgroundColor: dataVar(rank.get(a.app_name) ?? 0) }}
                    />
                    {a.app_name}
                  </span>
                  <span className="bb-byapp__track">
                    <span
                      className="bb-byapp__fill"
                      style={{
                        width: `${(a.total_s / maxApp) * 100}%`,
                        backgroundColor: dataVar(rank.get(a.app_name) ?? 0),
                      }}
                    />
                  </span>
                  <span className="bb-byapp__val">{fmt(a.total_s)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
