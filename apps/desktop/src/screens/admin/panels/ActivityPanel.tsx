import { useState } from "react";
import { useTranslation } from "react-i18next";
import { fmtHM, type EmployeeActivity } from "../reportTypes";

// Stable app colours by rank in the breakdown (display-only).
const APP_COLORS = [
  "var(--data-lavender)", "var(--data-mint)", "var(--data-sky)",
  "var(--data-amber)", "var(--data-rose)", "var(--data-teal)",
];
const colorAt = (i: number) => APP_COLORS[i % APP_COLORS.length];
const segFill = (c: string) => `linear-gradient(180deg, ${c}, color-mix(in srgb, ${c} 78%, #000))`;
const barFill = (c: string) => `linear-gradient(90deg, color-mix(in srgb, ${c} 70%, #fff), ${c})`;
const hourLabel = (ts: number) => `${String(new Date(ts * 1000).getHours()).padStart(2, "0")}:00`;

// Time-of-day timeline (from real samples) + donut + per-app bars. Ported from
// the web-admin ActivityPanel, restyled with desktop `bb-empact-*` classes.
export function ActivityPanel({ data }: { data: EmployeeActivity }) {
  const { t } = useTranslation();
  const [tip, setTip] = useState<{ label: string; left: number } | null>(null);

  const breakdown = [...data.breakdown].sort((a, b) => b.duration_s - a.duration_s);
  const total = breakdown.reduce((s, b) => s + b.duration_s, 0);
  if (breakdown.length === 0)
    return <div className="muted bb-adminboard__msg">{t("screens:detail.activity.empty")}</div>;

  const colorOf = new Map(breakdown.map((b, i) => [b.app_name, colorAt(i)]));
  const max = breakdown[0].duration_s || 1;

  // Merge back-to-back samples of the same app into blocks.
  const HOUR = 3600;
  const samples = [...data.samples].filter((s) => s.duration_s > 0).sort((a, b) => a.ts - b.ts);
  type Block = { app: string; ts: number; dur: number };
  const blocks: Block[] = [];
  for (const s of samples) {
    const prev = blocks[blocks.length - 1];
    if (prev && prev.app === s.app_name && s.ts - (prev.ts + prev.dur) < 60) {
      prev.dur = s.ts + s.duration_s - prev.ts;
    } else {
      blocks.push({ app: s.app_name, ts: s.ts, dur: s.duration_s });
    }
  }
  const hasTimeline = blocks.length > 0;
  const last = hasTimeline ? Math.max(...blocks.map((b) => b.ts + b.dur)) : 0;
  const start = hasTimeline ? Math.floor(blocks[0].ts / HOUR) * HOUR : 0;
  const end = Math.max(start + HOUR, Math.ceil(last / HOUR) * HOUR);
  const span = end - start || 1;
  const pct = (ts: number) => ((ts - start) / span) * 100;

  type Seg = { kind: "app" | "idle" | "end"; app?: string; left: number; width: number; dur: number };
  const segs: Seg[] = [];
  let cursor = start;
  blocks.forEach((b, i) => {
    if (b.ts > cursor) {
      segs.push({ kind: i === 0 ? "end" : "idle", left: pct(cursor), width: pct(b.ts) - pct(cursor), dur: b.ts - cursor });
    }
    const bEnd = b.ts + b.dur;
    segs.push({ kind: "app", app: b.app, left: pct(b.ts), width: pct(bEnd) - pct(b.ts), dur: b.dur });
    cursor = Math.max(cursor, bEnd);
  });
  if (cursor < end) segs.push({ kind: "end", left: pct(cursor), width: pct(end) - pct(cursor), dur: end - cursor });

  const maxDur = Math.max(1, ...blocks.map((b) => b.dur));
  const intensity = (dur: number) => 0.55 + 0.45 * (dur / maxDur);

  const hours = Math.max(1, Math.round(span / HOUR));
  const step = Math.max(1, Math.ceil(hours / 6));
  const ticks: number[] = [];
  for (let h = start; h <= end; h += step * HOUR) ticks.push(h);

  // Donut arcs (share of total).
  const R = 57.5;
  const C = 2 * Math.PI * R;
  const GAP = 16;
  let cum = 0;
  const arcs = breakdown.map((b, i) => {
    const frac = total > 0 ? b.duration_s / total : 0;
    const len = Math.max(0, frac * C - GAP);
    const arc = { color: colorAt(i), len, off: -cum };
    cum += frac * C;
    return arc;
  });

  return (
    <div className="bb-empact">
      <div className="card bb-empact__card">
        <div className="bb-empact__title">{t("screens:detail.activity.timeline")}</div>
        {hasTimeline ? (
          <>
            <div className="bb-empact-tlbox">
              <div className="bb-empact-timeline">
                {segs.map((s, i) => {
                  const center = Math.min(96, Math.max(4, s.left + s.width / 2));
                  if (s.kind === "app") {
                    return (
                      <div
                        key={i}
                        className="bb-empact-seg"
                        onMouseEnter={() => setTip({ label: `${s.app} · ${fmtHM(s.dur)}`, left: center })}
                        onMouseLeave={() => setTip(null)}
                        style={{ left: `${s.left}%`, width: `${s.width}%`, background: segFill(colorOf.get(s.app as string) as string), opacity: intensity(s.dur) }}
                      />
                    );
                  }
                  if (s.kind === "idle") {
                    return (
                      <div
                        key={i}
                        className="bb-empact-seg idle"
                        onMouseEnter={() => setTip({ label: `${t("screens:detail.activity.idle")} · ${fmtHM(s.dur)}`, left: center })}
                        onMouseLeave={() => setTip(null)}
                        style={{ left: `${s.left}%`, width: `${s.width}%` }}
                      />
                    );
                  }
                  return <div key={i} className="bb-empact-seg end" style={{ left: `${s.left}%`, width: `${s.width}%` }} />;
                })}
              </div>
              {tip && <div className="bb-empact-tip" style={{ left: `${tip.left}%` }}>{tip.label}</div>}
            </div>
            <div className="bb-empact-axis">
              {ticks.map((h) => <span key={h}>{hourLabel(h)}</span>)}
            </div>
          </>
        ) : (
          <div className="muted bb-adminboard__msg">{t("screens:detail.activity.empty")}</div>
        )}
      </div>

      <div className="card bb-empact__card">
        <div className="bb-empact__title">{t("screens:detail.activity.breakdown")}</div>
        <div className="bb-empact-donutwrap">
          <div className="bb-empact-donut">
            <svg width="130" height="130">
              {arcs.map((a, i) => (
                <circle key={i} cx="65" cy="65" r={R} fill="none" stroke={a.color} strokeWidth="15"
                  strokeDasharray={`${a.len} ${C - a.len}`} strokeDashoffset={a.off} strokeLinecap="round" transform="rotate(-90 65 65)" />
              ))}
            </svg>
            <div className="bb-empact-donut__mid">{fmtHM(total)}</div>
          </div>
        </div>
        <div className="bb-empact-appbars">
          {breakdown.map((b, i) => (
            <div className="bb-empact-appbar" key={b.app_name}>
              <div className="bb-empact-appbar__name">
                <span className="dot" style={{ background: colorAt(i) }} />
                <span className="txt" title={b.app_name}>{b.app_name}</span>
              </div>
              <div className="bb-empact-appbar__track">
                <div className="bb-empact-appbar__fill" style={{ width: `${(b.duration_s / max) * 100}%`, background: barFill(colorAt(i)) }} />
              </div>
              <div className="bb-empact-appbar__val">{fmtHM(b.duration_s)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
