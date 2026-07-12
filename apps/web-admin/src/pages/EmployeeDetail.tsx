import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  reportActivity,
  reportBrowser,
  reportEmployees,
  reportKeystrokes,
  reportScreenshots,
} from "../api/endpoints";
import type {
  ActivityResponse,
  BrowserVisit,
  KeystrokeBucket,
  ReportEmployee,
  ScreenshotMeta,
} from "../api/types";
import { ActivityPanel } from "../components/reports/ActivityPanel";
import { BrowserPanel } from "../components/reports/BrowserPanel";
import { KeystrokePanel } from "../components/reports/KeystrokePanel";
import { ScreenshotGallery } from "../components/reports/ScreenshotGallery";
import { Notice, Spinner } from "../components/ui";
import { dayRangeToUnix, fmtDuration, isoDate } from "../format";
import { useBusinesses } from "../useBusinesses";
import { memberTerms } from "../terms";
import { useAuth } from "../auth/AuthContext";
import { useDetailHeader } from "../detailHeader";

type Tab = "activity" | "keystrokes" | "browser" | "screenshots";
const TABS: Tab[] = ["activity", "keystrokes", "browser", "screenshots"];

// ── inline icons (no icon dependency in web-admin) ───────────────────
const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const IconChevron = svg(<path d="m9 18 6-6-6-6" />);
const IconCalendar = svg(<><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /></>);
const IconClock = svg(<><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>);
const IconAppWindow = svg(<><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M10 4v4" /><path d="M2 8h20" /><path d="M6 4v4" /></>);
const IconKeyboard = svg(<><path d="M10 8h.01" /><path d="M12 12h.01" /><path d="M14 8h.01" /><path d="M16 12h.01" /><path d="M18 8h.01" /><path d="M6 8h.01" /><path d="M7 16h10" /><path d="M8 12h.01" /><rect width="20" height="16" x="2" y="4" rx="2" /></>);
const IconCamera = svg(<><path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z" /><circle cx="12" cy="13" r="3" /></>);
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

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

type Status = "active" | "idle" | "offline";
function memberStatus(lastSeen: number | null): Status {
  if (!lastSeen) return "offline";
  const ageS = Date.now() / 1000 - lastSeen;
  if (ageS < 5 * 60) return "active";
  if (ageS < 30 * 60) return "idle";
  return "offline";
}

// ── detail stat card (no sparkline — matches the detail layout) ──────
function StatCard(props: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  focal?: boolean;
  delta?: string;
  down?: boolean;
  sub?: string;
}) {
  const { icon, label, value, focal, delta, down, sub } = props;
  return (
    <div className={`bibo-card ${focal ? "bibo-card--focal" : "bibo-card--default"} ad-cardpad`}>
      <div className={`bibo-stat${focal ? " bibo-stat--focal" : ""}`}>
        <div className="bibo-stat__top">
          <div className="bibo-stat__icon">{icon}</div>
          <div className="bibo-stat__label">{label}</div>
        </div>
        <div className="bibo-stat__value">{value}</div>
        <div className="bibo-stat__foot">
          {delta && (
            <span className={`bibo-stat__delta bibo-stat__delta--${down ? "down" : "up"}`}>
              {down ? TrendDown : TrendUp}
              {delta}
            </span>
          )}
          {sub && <span className="bibo-stat__sub">{sub}</span>}
        </div>
      </div>
    </div>
  );
}

export function EmployeeDetail() {
  const { t } = useTranslation("dashboard");
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const businessId = params.get("business");
  const { businesses } = useBusinesses();
  const { user } = useAuth();
  const { setTitle } = useDetailHeader();
  const terms = memberTerms(businesses.find((b) => b.id === businessId)?.kind);

  // Single-day view by default; switch to "range" for a custom span.
  const [mode, setMode] = useState<"day" | "range">("day");
  const [day, setDay] = useState(() => isoDate(new Date()));
  const [from, setFrom] = useState(() => isoDate(new Date()));
  const [to, setTo] = useState(() => isoDate(new Date()));

  const [tab, setTab] = useState<Tab>("activity");

  const [employee, setEmployee] = useState<ReportEmployee | null>(null);
  const [activity, setActivity] = useState<ActivityResponse | null>(null);
  const [keystrokes, setKeystrokes] = useState<KeystrokeBucket[] | null>(null);
  const [visits, setVisits] = useState<BrowserVisit[] | null>(null);
  const [shots, setShots] = useState<ScreenshotMeta[] | null>(null);
  // Totals for the previous period of the same length (for the delta chips);
  // null until loaded or when the comparison fetch fails.
  const [prev, setPrev] = useState<{ activeS: number; keys: number; shots: number } | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve the employee's identity from the roster (for the header).
  useEffect(() => {
    if (!businessId) return;
    reportEmployees(businessId)
      .then((r) => setEmployee(r.employees.find((e) => e.id === id) ?? null))
      .catch(() => {});
  }, [businessId, id]);

  // Push the member's name into the app header (replaces the section label);
  // cleared on unmount so other pages keep their own title.
  useEffect(() => {
    setTitle(employee?.display_name ?? null);
    return () => setTitle(null);
  }, [employee, setTitle]);

  const load = useCallback(async () => {
    if (!id) return;
    const [fromDate, toDate] = mode === "day" ? [day, day] : [from, to];
    const { from: f, to: to2 } = dayRangeToUnix(fromDate, toDate);
    if (f > to2) {
      setError(t("detail.errorStartAfterEnd"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Previous period of the same length, ending right before the selected one
      // (e.g. yesterday for a single day). Feeds the delta chips; non-fatal.
      const len = to2 - f + 1;
      const [a, k, b, s, p] = await Promise.all([
        reportActivity(id, f, to2),
        reportKeystrokes(id, f, to2),
        reportBrowser(id, f, to2),
        reportScreenshots(id, f, to2),
        Promise.all([
          reportActivity(id, f - len, f - 1),
          reportKeystrokes(id, f - len, f - 1),
          reportScreenshots(id, f - len, f - 1),
        ])
          .then(([pa, pk, ps]) => ({
            activeS: pa.breakdown.reduce((sum, x) => sum + x.duration_s, 0),
            keys: pk.buckets.reduce((sum, x) => sum + x.count, 0),
            shots: ps.screenshots.length,
          }))
          .catch(() => null),
      ]);
      setActivity(a);
      setKeystrokes(k.buckets);
      setVisits(b.visits);
      setShots(s.screenshots);
      setPrev(p);
    } catch {
      setError(t("detail.errorRange"));
    } finally {
      setLoading(false);
    }
  }, [id, mode, day, from, to, t]);

  useEffect(() => {
    load();
  }, [load]);

  const today = isoDate(new Date());

  // Summary stats for the selected day/range, derived from the loaded data.
  const activeS = activity?.breakdown.reduce((sum, b) => sum + b.duration_s, 0) ?? 0;
  const topApp = activity?.breakdown[0]?.app_name ?? "—";
  const topAppS = activity?.breakdown[0]?.duration_s ?? 0;
  const keypresses = keystrokes?.reduce((sum, b) => sum + b.count, 0) ?? 0;
  // Top app's share of active time (real) — shown as the "focus" chip.
  const topShare = activeS > 0 ? Math.round((topAppS / activeS) * 100) : 0;

  // Period-over-period deltas vs the previous day/period; null hides the chip
  // (no comparison data, or a zero baseline where a % is meaningless).
  const pctDelta = (cur: number, prevVal: number) =>
    prevVal > 0 ? Math.round(((cur - prevVal) / prevVal) * 100) : null;
  const activeDelta = prev ? pctDelta(activeS, prev.activeS) : null;
  const keysDelta = prev ? pctDelta(keypresses, prev.keys) : null;
  const shotsDelta = prev ? (shots?.length ?? 0) - prev.shots : null;
  const vsPrev = mode === "day" ? t("detail.vsPrevDay") : t("detail.vsPrevPeriod");

  const name = employee?.display_name ?? terms.one;
  const isSelf = employee?.role === "owner" || (!!employee && employee.id === user?.id);
  const status = memberStatus(employee?.last_seen ?? null);

  const dateInput = (value: string, onChange: (v: string) => void, min?: string, max?: string) => (
    <input type="date" value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} />
  );

  return (
    <div className="ad-wrap" style={{ paddingBottom: 32 }}>
      {/* breadcrumb */}
      <div className="ad-crumb">
        <Link to="/">{t("detail.breadcrumbDashboard")}</Link>
        <span style={{ display: "inline-flex", lineHeight: 0 }}>{IconChevron}</span>
        <span>{terms.many}</span>
        <span style={{ display: "inline-flex", lineHeight: 0 }}>{IconChevron}</span>
        <span className="ad-crumb__here">{name}</span>
      </div>

      {/* detail header */}
      <div className="ad-detailhead">
        <span className="bibo-avatar" style={{ ["--_s" as string]: "48px" }}>
          <span
            className="bibo-avatar__img"
            aria-label={name}
            style={{ background: "var(--info-soft)", color: "var(--info)" }}
          >
            {initials(name)}
          </span>
          <span className={`bibo-avatar__dot bibo-avatar__dot--${status}`} />
        </span>
        <div className="ad-detailhead__id">
          <div className="ad-detailhead__name">
            {name}
            {isSelf && <span className="ad-self">{t("dashboard.selfBadge")}</span>}
          </div>
          {employee && (
            <div className="ad-detailhead__login">{employee.email || employee.username}</div>
          )}
        </div>

        <div className="ad-datemode">
          <div className="bibo-seg bibo-seg--sm" role="tablist" aria-label={t("detail.dateMode")}>
            <button
              role="tab"
              aria-selected={mode === "day"}
              className={`bibo-seg__opt${mode === "day" ? " bibo-seg__opt--on" : ""}`}
              onClick={() => setMode("day")}
            >
              {t("detail.singleDay")}
            </button>
            <button
              role="tab"
              aria-selected={mode === "range"}
              className={`bibo-seg__opt${mode === "range" ? " bibo-seg__opt--on" : ""}`}
              onClick={() => setMode("range")}
            >
              {t("detail.dateRange")}
            </button>
          </div>

          {mode === "day" ? (
            <span className="ad-datefield">
              <span style={{ display: "inline-flex", lineHeight: 0 }}>{IconCalendar}</span>
              {dateInput(day, setDay, undefined, today)}
            </span>
          ) : (
            <>
              <span className="ad-datefield">
                <span className="ad-datefield__lbl">{t("detail.from")}</span>
                {dateInput(from, setFrom, undefined, to)}
              </span>
              <span className="ad-datefield">
                <span className="ad-datefield__lbl">{t("detail.to")}</span>
                {dateInput(to, setTo, from, today)}
              </span>
            </>
          )}
        </div>
      </div>

      {!businessId && <Notice kind="info">{t("detail.noBusinessContext")}</Notice>}
      {error && <Notice kind="danger">{error}</Notice>}

      {/* summary stat cards */}
      <div className="ad-stats">
        <StatCard
          focal
          icon={IconClock}
          label={mode === "day" ? t("detail.summary.activeTime") : t("detail.summary.activeTimeRange")}
          value={fmtDuration(activeS)}
          delta={activeDelta !== null ? `${Math.abs(activeDelta)}%` : undefined}
          down={activeDelta !== null && activeDelta < 0}
          sub={vsPrev}
        />
        <StatCard
          icon={IconAppWindow}
          label={t("detail.summary.topApp")}
          value={topApp}
          delta={`${topShare}%`}
          sub={t("dashboard.statFocus")}
        />
        <StatCard
          icon={IconKeyboard}
          label={t("detail.summary.keypresses")}
          value={keypresses.toLocaleString()}
          delta={keysDelta !== null ? `${Math.abs(keysDelta)}%` : undefined}
          down={keysDelta !== null && keysDelta < 0}
          sub={vsPrev}
        />
        <StatCard
          icon={IconCamera}
          label={t("detail.summary.screenshots")}
          value={(shots?.length ?? 0).toLocaleString()}
          delta={shotsDelta !== null ? `${shotsDelta >= 0 ? "+" : "−"}${Math.abs(shotsDelta)}` : undefined}
          down={shotsDelta !== null && shotsDelta < 0}
          sub={vsPrev}
        />
      </div>

      {/* tabs + panel */}
      <div className="ad-tabwrap">
        <div className="bibo-tabs bibo-tabs--pill" role="tablist">
          {TABS.map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              className={`bibo-tab${tab === key ? " bibo-tab--on" : ""}`}
              onClick={() => setTab(key)}
            >
              {t(`detail.tabs.${key}`)}
            </button>
          ))}
        </div>

        <div className="ad-panel">
          {loading ? (
            <Spinner label={t("detail.loadingReports")} />
          ) : (
            !error && (
              <>
                {tab === "activity" &&
                  (activity ? <ActivityPanel data={activity} /> : <Spinner />)}
                {/* Browser panel renders its own table card */}
                {tab === "browser" && (visits ? <BrowserPanel visits={visits} /> : <Spinner />)}
                {(tab === "keystrokes" || tab === "screenshots") && (
                  <div className="bibo-card bibo-card--default ad-cardpad">
                    {tab === "keystrokes" &&
                      (keystrokes ? <KeystrokePanel buckets={keystrokes} /> : <Spinner />)}
                    {tab === "screenshots" &&
                      (shots ? <ScreenshotGallery shots={shots} /> : <Spinner />)}
                  </div>
                )}
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
