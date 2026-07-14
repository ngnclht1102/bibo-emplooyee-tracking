import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { KeystrokeBucketRow } from "../reportTypes";

// chart geometry
const BW = 24, STEP = 40, PAD = 20, H = 240, TOP = 14, BOT = 210;
const CHART_H = BOT - TOP;

// Counts only — never the keys themselves (privacy). Bar chart across the day;
// click a bar/chip to inspect a bucket. Ported from web-admin KeystrokePanel.
export function KeystrokePanel({ buckets }: { buckets: KeystrokeBucketRow[] }) {
  const { t } = useTranslation();
  const [sel, setSel] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const active = sel ?? buckets.length - 1;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || buckets.length === 0) return;
    const barCenter = PAD + active * STEP + BW / 2;
    el.scrollTo({ left: Math.max(0, barCenter - el.clientWidth / 2), behavior: "smooth" });
  }, [active, buckets.length]);

  if (buckets.length === 0)
    return <div className="muted bb-adminboard__msg">{t("screens:detail.keystrokes.empty")}</div>;

  const max = Math.max(...buckets.map((b) => b.count), 1);
  const shownTotal = buckets.slice(0, active + 1).reduce((s, b) => s + b.count, 0);
  const svgW = PAD + buckets.length * STEP;
  const hh = (ts: number) => String(new Date(ts * 1000).getHours()).padStart(2, "0");
  const hhmm = (ts: number) => {
    const d = new Date(ts * 1000);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <div className="card bb-empks">
      <div className="bb-empact__title">{t("screens:detail.keystrokes.title")}</div>
      <div className="bb-empks-total">
        <span className="bb-empks-num num">{shownTotal.toLocaleString()}</span>
        <span className="bb-empks-lbl">{t("screens:detail.keystrokes.keypresses")}</span>
      </div>
      <div className="bb-empks-scroll" ref={scrollRef}>
        <svg width={svgW} height={H} viewBox={`0 0 ${svgW} ${H}`} style={{ overflow: "visible" }}>
          {buckets.map((b, i) => {
            const h = (b.count / max) * CHART_H;
            const x = PAD + i * STEP;
            const y = BOT - h;
            const cx = x + BW / 2;
            const on = i === active;
            return (
              <g key={b.ts_bucket}>
                <rect x={x} y={y} width={BW} height={h} rx={7}
                  fill={on ? "var(--accent)" : "var(--data-sky)"} opacity={i > active ? 0.18 : 1}
                  style={{ cursor: "pointer" }} onClick={() => setSel(i)} />
                {i % 3 === 0 && (
                  <text x={cx} y={238} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--text-muted)">
                    {hh(b.ts_bucket)}
                  </text>
                )}
                {on && (
                  <g transform={`translate(${cx}, ${y})`}>
                    <rect x={-27} y={-30} width={54} height={24} rx={8} fill="var(--accent)" />
                    <text x={0} y={-13} textAnchor="middle" fontSize={12} fontWeight={700} fill="#fff">
                      {b.count.toLocaleString()}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="bb-empks-chips">
        {buckets.map((b, i) => (
          <button key={b.ts_bucket} className={`bb-empks-chip${i === active ? " on" : ""}`} onClick={() => setSel(i)}>
            {hhmm(b.ts_bucket)}
          </button>
        ))}
      </div>
      <div className="bb-empks-privacy">🔒 {t("screens:detail.keystrokes.privacy")}</div>
    </div>
  );
}
