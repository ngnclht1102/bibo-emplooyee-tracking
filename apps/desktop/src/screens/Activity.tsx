import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { call as invoke } from "../api";
import { Card } from "../ui";

const SLOT_S = 1800; // 30-minute display slots

function startOfTodayTs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

/* small inline icons (stroke = currentColor) */
const FlameIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="12"
    height="12"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4" />
  </svg>
);
const InfoIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4" />
    <path d="M12 8h.01" />
  </svg>
);

/* SVG bar-chart geometry (fixed step → horizontal scroll on long days) */
const BAR_W = 26;
const STEP = 44.6;
const PAD = 23.4;
const CHART_H = 260;
const BASE = 230; // bar baseline (bottom edge)
const TOP = 14; // highest a full bar reaches
const SPAN = BASE - TOP;

export function Activity() {
  const { t, i18n } = useTranslation("screens");
  const [slots, setSlots] = useState<number[]>([]);
  const [dayStart, setDayStart] = useState(startOfTodayTs());
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const from = startOfTodayTs();
      const to = Math.floor(Date.now() / 1000) + 1;
      try {
        const buckets = await invoke<[number, number][]>("keystroke_buckets", {
          fromTs: from,
          toTs: to,
        });
        if (!alive) return;
        const slotCount = Math.max(1, Math.ceil((to - from) / SLOT_S));
        const agg = new Array(slotCount).fill(0);
        let sum = 0;
        for (const [ts, count] of buckets) {
          const i = Math.min(slotCount - 1, Math.floor((ts - from) / SLOT_S));
          agg[i] += count;
          sum += count;
        }
        setSlots(agg);
        setTotal(sum);
        setDayStart(from);
      } catch {
        /* ignore transient errors */
      }
    };
    load();
    const id = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Localized HH:MM label for a slot index.
  const fmtTime = useMemo(() => {
    const f = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return (i: number) => f.format(new Date((dayStart + i * SLOT_S) * 1000));
  }, [i18n.resolvedLanguage, dayStart]);

  const max = Math.max(1, ...slots);
  // Busiest 30-minute window (argmax) — derived from existing data, no extra call.
  const busiest = slots.reduce((bi, v, i, a) => (v > a[bi] ? i : bi), 0);
  // Selected slot drives the highlight / tooltip / detail note; defaults to busiest.
  const sel = selected != null && selected < slots.length ? selected : busiest;
  // Display window: trim leading empty slots so the chart starts when typing began.
  let firstActive = slots.findIndex((v) => v > 0);
  if (firstActive < 0) firstActive = 0;
  const view: number[] = [];
  for (let i = firstActive; i < slots.length; i++) view.push(i);

  const chartW = PAD * 2 + Math.max(0, view.length - 1) * STEP + BAR_W;

  return (
    <div className="bb-act">
      <Card>
        <div className="bb-panel__head">
          <div>
            <div className="bb-panel__title">{t("activity.chartTitle")}</div>
            <div className="bb-panel__sub">{t("activity.chartSub")}</div>
          </div>
          <span className="bb-live">
            <span className="bb-live__dot" />
            {t("activity.live")}
          </span>
        </div>

        {total === 0 ? (
          <div className="muted" style={{ fontSize: 12 }}>
            {t("activity.empty")}
          </div>
        ) : (
          <>
            <div className="bb-act-total">
              <span className="bb-act-total__num num">{total.toLocaleString()}</span>
              <span className="bb-act-total__lbl">{t("activity.totalLabel")}</span>
              <span className="bb-act-badge">
                <FlameIcon />
                {t("activity.busiest", { time: fmtTime(busiest) })}
              </span>
            </div>

            <div className="bb-act-chart">
              <svg
                width={chartW}
                height={CHART_H}
                viewBox={`0 0 ${chartW} ${CHART_H}`}
                style={{ overflow: "visible", display: "block" }}
                role="img"
                aria-label={t("activity.chartTitle")}
              >
                {view.map((i, k) => {
                  const v = slots[i];
                  const h = v > 0 ? Math.max(6, (v / max) * SPAN) : 3;
                  const x = PAD + k * STEP;
                  const cx = x + BAR_W / 2;
                  const y = BASE - h;
                  const onHour = i % 2 === 0; // 30-min slots align to midnight → even = on the hour
                  const isSel = i === sel;
                  return (
                    <g key={i}>
                      <rect
                        x={x}
                        y={y}
                        width={BAR_W}
                        height={h}
                        rx={7}
                        className={`bb-act-bar${isSel ? " is-active" : ""}`}
                      >
                        <title>{`${fmtTime(i)} · ${t("activity.keysTooltip", { count: v })}`}</title>
                      </rect>
                      {onHour && (
                        <text
                          x={cx}
                          y={258}
                          textAnchor="middle"
                          fontSize={11}
                          fontWeight={600}
                          className="bb-act-axislbl"
                        >
                          {String(Math.floor(i / 2)).padStart(2, "0")}
                        </text>
                      )}
                      {isSel && (
                        <g transform={`translate(${cx}, ${Math.max(24, y)})`}>
                          <rect className="bb-act-tip__bg" x={-28} y={-26} width={56} height={22} rx={8} />
                          <text className="bb-act-tip__txt" x={0} y={-11} textAnchor="middle" fontSize={12} fontWeight={700}>
                            {slots[sel].toLocaleString()}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="bb-act-slots">
              {view.map((i) => (
                <button
                  key={i}
                  type="button"
                  className={`bb-act-slot${i === sel ? " is-active" : ""}`}
                  onClick={() => setSelected(i)}
                >
                  {fmtTime(i)}
                </button>
              ))}
            </div>

            <div className="bb-note">
              <InfoIcon />
              {t("activity.slotDetail", {
                time: fmtTime(sel),
                count: slots[sel],
                formattedCount: slots[sel].toLocaleString(),
              })}
            </div>
            <div className="bb-act-privacy">{t("activity.privacy")}</div>
          </>
        )}
      </Card>
    </div>
  );
}
