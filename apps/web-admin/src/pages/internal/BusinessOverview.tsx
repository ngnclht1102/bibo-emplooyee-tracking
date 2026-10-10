import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { adminOverview } from "../../api/endpoints";
import type { Overview, OverviewDay } from "../../api/types";
import { Empty, Notice, Spinner } from "../../components/ui";
import { activeLocale } from "../../i18n";

// Super-admin Business overview (ticket 149). Built only from the shared design
// system: bibo-card / bibo-stat / admin-panel / admin-appbars / admin-table /
// bibo-seg + theme tokens. All numbers come from the backend; days are UTC.

type Range = 30 | 90 | 180;
type Metric = "dau" | "wau" | "mau" | "new_signups" | "active_workspaces";
const RANGES: Range[] = [30, 90, 180];
const METRICS: Metric[] = ["dau", "wau", "mau", "new_signups", "active_workspaces"];

// ── formatting ───────────────────────────────────────────────────────
const nf = () => new Intl.NumberFormat(activeLocale());
const fmtNum = (n: number) => nf().format(n);
const fmtPct = (r: number) => `${Math.round(r * 100)}%`;
/** Duration as H:MM, matching the owner dashboard cards. */
function fmtClock(seconds: number): string {
  const s = Math.max(0, seconds | 0);
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
}
/** YYYY-MM-DD (UTC day) → short localized date. */
function fmtDay(iso: string, withYear = false): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(activeLocale(), {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });
}
function daysSince(iso: string, asOf: string): number {
  return Math.round((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / 86400000) + 1;
}

// ── deltas (same shape as the owner dashboard) ───────────────────────
type Delta = { text: string; up: boolean } | null;
function pctDelta(now: number, prev: number): Delta {
  if (prev <= 0) return null;
  const pct = Math.round(((now - prev) / prev) * 100);
  if (pct === 0) return null;
  return { text: `${Math.abs(pct)}%`, up: pct > 0 };
}
function ptsDelta(now: number, prev: number): Delta {
  const pts = Math.round((now - prev) * 100);
  if (pts === 0 || prev <= 0) return null;
  return { text: `${Math.abs(pts)} pts`, up: pts > 0 };
}

// ── inline icons (web-admin has no icon dependency) ──────────────────
const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const IconUsers = svg(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><path d="M16 3.128a4 4 0 0 1 0 7.744" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" /></>);
const IconSun = svg(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2m-7.07-2.93 1.41-1.41m11.32-11.32 1.41-1.41M2 12h2m16 0h2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41" /></>);
const IconMagnet = svg(<><path d="m6 15-4-4 6.75-6.77a7.79 7.79 0 0 1 11 11L13 22l-4-4 6.39-6.36a2.14 2.14 0 0 0-3-3L6 15" /><path d="m5 8 4 4M12 15l4 4" /></>);
const IconUserPlus = svg(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></>);
const IconBuilding = svg(<><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01" /></>);
const IconAlert = svg(<><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4M12 17h.01" /></>);
const IconLogOut = svg(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></>);
const IconClock = svg(<><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>);
const TrendUp = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
    <path d="M7 17 17 7M9 7h8v8" />
  </svg>
);
const TrendDown = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
    <path d="M7 7 17 17M17 9v8H9" />
  </svg>
);

// ── stat card (same markup as the owner dashboard) ───────────────────
function StatCard(props: { icon: ReactNode; label: string; value: ReactNode; focal?: boolean; delta?: Delta; sub?: string }) {
  const { icon, label, value, focal, delta, sub } = props;
  return (
    <div className={`bibo-card ${focal ? "bibo-card--focal" : "bibo-card--default"} admin-cardpad`}>
      <div className={`bibo-stat${focal ? " bibo-stat--focal" : ""}`}>
        <div className="bibo-stat__top">
          <div className="bibo-stat__icon">{icon}</div>
          <div className="bibo-stat__label">{label}</div>
        </div>
        <div className="bibo-stat__value">{value}</div>
        <div className="bibo-stat__foot">
          {delta && (
            <span className={`bibo-stat__delta bibo-stat__delta--${delta.up ? "up" : "down"}`}>
              {delta.up ? TrendUp : TrendDown}
              {delta.text}
            </span>
          )}
          {sub && <span className="bibo-stat__sub">{sub}</span>}
        </div>
      </div>
    </div>
  );
}

// ── trend chart: smooth area + glowing node + dark tooltip bubble ────
const CH = 220; // svg height
const PT = 16; // top pad
const PB = 30; // bottom pad (x labels)
const PL = 36; // left pad (y labels)

function smoothPath(pts: [number, number][]): string {
  if (pts.length === 0) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const cx = (x0 + x1) / 2;
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  return d;
}

function TrendChart({ series, metric, label }: { series: OverviewDay[]; metric: Metric; label: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  const [hover, setHover] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(200, el.clientWidth)));
    ro.observe(el);
    setW(Math.max(200, el.clientWidth));
    return () => ro.disconnect();
  }, []);

  const vals = series.map((d) => d[metric]);
  const max = Math.max(...vals, 1);
  const niceMax = Math.ceil(max / 4) * 4 || 4;
  const plotW = w - PL - 8;
  const plotH = CH - PT - PB;
  const x = (i: number) => PL + (series.length <= 1 ? plotW / 2 : (i / (series.length - 1)) * plotW);
  const y = (v: number) => PT + plotH - (v / niceMax) * plotH;
  const pts = vals.map((v, i) => [x(i), y(v)] as [number, number]);
  const line = smoothPath(pts);
  const area = pts.length ? `${line} L${x(pts.length - 1)},${PT + plotH} L${x(0)},${PT + plotH} Z` : "";
  const ticksY = [0, niceMax / 2, niceMax];
  // ~1 date label per 90px so they never collide on narrow screens
  const labelEvery = Math.max(1, Math.ceil(series.length / Math.max(2, Math.floor(plotW / 90))));
  const active = hover ?? series.length - 1;

  function onMove(e: React.MouseEvent<SVGRectElement>) {
    const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = Math.round((px / rect.width) * (series.length - 1));
    setHover(Math.min(series.length - 1, Math.max(0, i)));
  }

  return (
    <div className="admin-trend" ref={boxRef}>
      <svg width={w} height={CH} viewBox={`0 0 ${w} ${CH}`} role="img" aria-label={label}>
        <defs>
          <linearGradient id="admin-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand-500)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--brand-500)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticksY.map((tv) => (
          <g key={tv}>
            <line x1={PL} x2={w - 8} y1={y(tv)} y2={y(tv)} className="admin-trend__grid" />
            <text x={PL - 10} y={y(tv) + 4} textAnchor="end" className="admin-trend__lbl">
              {fmtNum(tv)}
            </text>
          </g>
        ))}
        {series.map((d, i) =>
          i % labelEvery === 0 || i === series.length - 1 ? (
            <text key={d.day} x={x(i)} y={CH - 8} textAnchor="middle" className="admin-trend__lbl">
              {fmtDay(d.day)}
            </text>
          ) : null,
        )}
        <path d={area} fill="url(#admin-trend-fill)" />
        <path d={line} fill="none" stroke="var(--brand-500)" strokeWidth={2.5} strokeLinecap="round" />
        {pts[active] && (
          <g>
            <line x1={pts[active][0]} x2={pts[active][0]} y1={PT} y2={PT + plotH} className="admin-trend__cursor" />
            <circle cx={pts[active][0]} cy={pts[active][1]} r={9} fill="var(--brand-500)" opacity={0.18} />
            <circle cx={pts[active][0]} cy={pts[active][1]} r={4.5} fill="var(--brand-500)" stroke="var(--bg)" strokeWidth={2} />
          </g>
        )}
        <rect
          x={PL}
          y={PT}
          width={plotW}
          height={plotH}
          fill="transparent"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        />
      </svg>
      {pts[active] && (
        <div
          className="admin-tltip"
          style={{ left: Math.min(w - 70, Math.max(70, pts[active][0])), top: pts[active][1] - 10 }}
        >
          {fmtNum(vals[active])} · {fmtDay(series[active].day)}
        </div>
      )}
    </div>
  );
}

// ── horizontal bars (funnel / frequency) on admin-appbars ────────────
function Bars({ rows, color }: { rows: { label: string; value: number; note?: string }[]; color: string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="admin-appbars admin-appbars--wide">
      {rows.map((r) => (
        <div className="admin-appbar" key={r.label}>
          <div className="admin-appbar__name">
            <span className="txt" title={r.label}>
              {r.label}
            </span>
          </div>
          <div className="admin-appbar__track">
            <div className="admin-appbar__fill" style={{ width: `${(r.value / max) * 100}%`, background: color }} />
          </div>
          <div className="admin-appbar__val">
            {fmtNum(r.value)}
            {r.note && <span className="admin-appbar__note">{r.note}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function BusinessOverview() {
  const { t } = useTranslation("dashboard");
  const [range, setRange] = useState<Range>(90);
  const [metric, setMetric] = useState<Metric>("dau");
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    adminOverview(range)
      .then((r) => !cancelled && setData(r))
      .catch(() => !cancelled && setError(t("overview.error")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [range]);

  const k = data?.kpis;
  const f = data?.funnel;
  const metricLabel = (m: Metric) => t(`overview.metric.${m}`);
  const lastVal = data?.series.length ? data.series[data.series.length - 1][metric] : 0;
  const rangeTotal = data ? data.series.reduce((s, d) => s + d[metric], 0) : 0;
  const isSum = metric === "new_signups";
  const funnelPct = (n: number) => (f && f.created > 0 ? fmtPct(n / f.created) : undefined);
  const freqPeople = data ? data.frequency.reduce((s, b) => s + b.people, 0) : 0;

  return (
    <div className="admin-wrap" style={{ paddingBottom: 32 }}>
      <div className="admin-pagehead">
        <div className="admin-pagehead__main">
          <h1 className="admin-h1">{t("overview.title")}</h1>
          <p className="admin-sub">
            {data ? t("overview.sub", { date: fmtDay(data.as_of, true) }) : t("overview.subLoading")}
          </p>
        </div>
        <div className="admin-pagehead__actions">
          <div className="bibo-seg bibo-seg--sm" role="tablist" aria-label={t("overview.range")}>
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                role="tab"
                aria-selected={r === range}
                className={`bibo-seg__opt${r === range ? " bibo-seg__opt--on" : ""}`}
                onClick={() => setRange(r)}
              >
                {t("overview.rangeDays", { count: r })}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <Notice kind="danger">{error}</Notice>}
      {loading && !data && <Spinner label={t("overview.loading")} />}

      {data && k && f && (
        <div style={{ opacity: loading ? 0.6 : 1, transition: "opacity 0.15s ease" }}>
          <div className="admin-stats">
            <StatCard
              focal
              icon={IconUsers}
              label={t("overview.kpi.mau")}
              value={fmtNum(k.mau)}
              delta={pctDelta(k.mau, k.mau_prev)}
              sub={t("overview.vsPrevMonth")}
            />
            <StatCard
              icon={IconSun}
              label={t("overview.kpi.dau")}
              value={fmtNum(k.dau)}
              delta={pctDelta(k.dau, k.dau_prev)}
              sub={t("overview.vsLastWeek")}
            />
            <StatCard
              icon={IconMagnet}
              label={t("overview.kpi.stickiness")}
              value={<>{Math.round(k.stickiness * 100)}<span className="bibo-stat__unit">%</span></>}
              delta={ptsDelta(k.stickiness, k.stickiness_prev)}
              sub={t("overview.stickinessSub")}
            />
            <StatCard
              icon={IconUserPlus}
              label={t("overview.kpi.signups")}
              value={fmtNum(k.new_signups)}
              delta={pctDelta(k.new_signups, k.new_signups_prev)}
              sub={t("overview.inRange", { count: range })}
            />
          </div>
          <div className="admin-stats">
            <StatCard
              icon={IconBuilding}
              label={t("overview.kpi.activeWorkspaces")}
              value={fmtNum(k.active_workspaces)}
              delta={pctDelta(k.active_workspaces, k.active_workspaces_prev)}
              sub={t("overview.ofTotal", { total: fmtNum(data.totals.workspaces) })}
            />
            <StatCard icon={IconAlert} label={t("overview.kpi.atRisk")} value={fmtNum(k.at_risk)} sub={t("overview.atRiskSub")} />
            <StatCard
              icon={IconLogOut}
              label={t("overview.kpi.churned")}
              value={fmtNum(k.churned)}
              sub={t("overview.churnedSub", { count: range, total: fmtNum(k.churned_total) })}
            />
            <StatCard
              icon={IconClock}
              label={t("overview.kpi.avgTracked")}
              value={fmtClock(k.avg_tracked_s)}
              delta={pctDelta(k.avg_tracked_s, k.avg_tracked_s_prev)}
              sub={t("overview.avgTrackedSub")}
            />
          </div>

          {/* Trend */}
          <div className="bibo-card bibo-card--default admin-cardpad">
            <div className="admin-panelhead admin-panelhead--wrap">
              <div className="admin-paneltitle">{t("overview.trend")}</div>
              <div className="bibo-seg bibo-seg--sm admin-panelhead__end" role="tablist" aria-label={t("overview.trend")}>
                {METRICS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={m === metric}
                    className={`bibo-seg__opt${m === metric ? " bibo-seg__opt--on" : ""}`}
                    onClick={() => setMetric(m)}
                  >
                    {metricLabel(m)}
                  </button>
                ))}
              </div>
            </div>
            <div className="admin-act-total">
              <span className="admin-act-num">{fmtNum(isSum ? rangeTotal : lastVal)}</span>
              <span className="admin-act-lbl">
                {isSum ? t("overview.trendTotal", { count: range }) : t("overview.trendLatest", { metric: metricLabel(metric) })}
              </span>
            </div>
            {data.series.length > 0 ? (
              <TrendChart series={data.series} metric={metric} label={metricLabel(metric)} />
            ) : (
              <Empty>{t("overview.noData")}</Empty>
            )}
          </div>

          {/* Activation funnel + usage frequency */}
          <div className="admin-twocol admin-panel">
            <div className="bibo-card bibo-card--default admin-cardpad">
              <div className="admin-panelhead">
                <div className="admin-paneltitle">{t("overview.funnel.title")}</div>
              </div>
              {f.created > 0 ? (
                <>
                  <p className="admin-panelnote">
                    {t("overview.funnel.sub", { from: fmtDay(f.from), to: fmtDay(f.to) })}
                  </p>
                  <Bars
                    color="var(--brand-500)"
                    rows={[
                      { label: t("overview.funnel.created"), value: f.created },
                      { label: t("overview.funnel.firstData"), value: f.first_data, note: funnelPct(f.first_data) },
                      { label: t("overview.funnel.activated"), value: f.activated, note: funnelPct(f.activated) },
                      { label: t("overview.funnel.week2"), value: f.week2, note: funnelPct(f.week2) },
                      { label: t("overview.funnel.twoPlus"), value: f.two_plus, note: funnelPct(f.two_plus) },
                    ]}
                  />
                </>
              ) : (
                <Empty>{t("overview.funnel.empty")}</Empty>
              )}
            </div>
            <div className="bibo-card bibo-card--default admin-cardpad">
              <div className="admin-panelhead">
                <div className="admin-paneltitle">{t("overview.freq.title")}</div>
              </div>
              <p className="admin-panelnote">{t("overview.freq.sub", { count: freqPeople })}</p>
              <Bars
                color="var(--data-sky)"
                rows={data.frequency.map((b) => ({
                  label: t(`overview.freq.bucket.${b.bucket}`),
                  value: b.people,
                  note: freqPeople > 0 ? fmtPct(b.people / freqPeople) : undefined,
                }))}
              />
            </div>
          </div>

          {/* Retention cohorts */}
          <div className="bibo-card bibo-card--default admin-cardpad admin-panel">
            <div className="admin-panelhead">
              <div className="admin-paneltitle">{t("overview.cohorts.title")}</div>
            </div>
            <p className="admin-panelnote">{t("overview.cohorts.sub")}</p>
            {data.cohorts.length > 0 ? (
              <div className="admin-tablecard admin-tablecard--flat">
                <table className="admin-table admin-table--grid">
                  <thead>
                    <tr>
                      <th>{t("overview.cohorts.week")}</th>
                      <th className="r">{t("overview.cohorts.size")}</th>
                      {data.cohorts[0].retained.map((_, i) => (
                        <th key={i} className="c">
                          {t("overview.cohorts.wk", { n: i })}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.cohorts.map((c) => (
                      <tr key={c.week}>
                        <td className="admin-relt">{fmtDay(c.week, true)}</td>
                        <td className="r admin-dur">{fmtNum(c.size)}</td>
                        {c.retained.map((v, i) => (
                          <td key={i} className="c">
                            {v == null ? null : (
                              <span
                                className="admin-heat"
                                style={{ ["--_p" as string]: `${Math.round(8 + v * 62)}%` }}
                                title={`${fmtPct(v)} · ${Math.round(v * c.size)}/${c.size}`}
                              >
                                {fmtPct(v)}
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>{t("overview.noData")}</Empty>
            )}
          </div>

          {/* Watchlist */}
          <div className="bibo-card bibo-card--default admin-cardpad admin-panel">
            <div className="admin-panelhead">
              <div className="admin-paneltitle">{t("overview.watch.title")}</div>
              <span className="admin-self">{fmtNum(data.watchlist.length)}</span>
            </div>
            <p className="admin-panelnote">{t("overview.watch.sub", { count: range })}</p>
            {data.watchlist.length > 0 ? (
              <div className="admin-tablecard admin-tablecard--flat">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>{t("overview.watch.workspace")}</th>
                      <th>{t("overview.watch.owner")}</th>
                      <th className="r">{t("overview.watch.people")}</th>
                      <th>{t("overview.watch.created")}</th>
                      <th>{t("overview.watch.lastActive")}</th>
                      <th>{t("overview.watch.status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.watchlist.map((w) => (
                      <tr key={w.id}>
                        <td>
                          <div className="admin-wsname">
                            <span className="admin-wsname__txt">{w.name}</span>
                            <span className="admin-self">{t(`overview.kind.${w.kind}`)}</span>
                          </div>
                        </td>
                        <td>
                          <div className="admin-ownercell">
                            <span>{w.owner}</span>
                            <span className="admin-login">{w.owner_login}</span>
                          </div>
                        </td>
                        <td className="r admin-dur">{fmtNum(w.people)}</td>
                        <td className="admin-relt">{fmtDay(w.created_on, true)}</td>
                        <td className="admin-relt">
                          {t("overview.watch.daysAgo", { count: daysSince(w.last_active, data.as_of) })}
                        </td>
                        <td>
                          <span className={`admin-pill admin-pill--${w.status === "at_risk" ? "warn" : "neg"}`}>
                            {t(`overview.status.${w.status}`)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>{t("overview.watch.empty")}</Empty>
            )}
          </div>

          <div className="admin-notice admin-notice--info">{t("overview.footnote")}</div>
        </div>
      )}
    </div>
  );
}
