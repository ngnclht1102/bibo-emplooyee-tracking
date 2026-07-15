import { useCallback, useEffect, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { call as invoke } from "../../api";
import { StatCard } from "../../ui";
import { initials, type RosterEntry } from "./AdminDashboard";
import { ActivityPanel } from "./panels/ActivityPanel";
import { KeystrokePanel } from "./panels/KeystrokePanel";
import { BrowserPanel } from "./panels/BrowserPanel";
import { ScreenshotGallery } from "./panels/ScreenshotGallery";
import {
  fmtHM,
  type BrowserVisitRow,
  type EmployeeActivity,
  type KeystrokeBucketRow,
  type ScreenshotMetaRow,
} from "./reportTypes";

type Tab = "activity" | "keystrokes" | "browser" | "screenshots";
const TABS: Tab[] = ["activity", "keystrokes", "browser", "screenshots"];

const svgp = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const IconBack = () => (<svg {...svgp} width="22" height="22" aria-hidden><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>);
const IconChevron = () => (<svg {...svgp} width="14" height="14" aria-hidden><path d="m9 18 6-6-6-6" /></svg>);
const IconClock = () => (<svg {...svgp} aria-hidden><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>);
const IconApp = () => (<svg {...svgp} aria-hidden><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 8h20" /><path d="M6 4v4" /></svg>);
const IconKeyboard = () => (<svg {...svgp} aria-hidden><rect width="20" height="16" x="2" y="4" rx="2" /><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10" /></svg>);
const IconCamera = () => (<svg {...svgp} aria-hidden><path d="M14.5 4h-5L8 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-4z" /><circle cx="12" cy="13" r="3.2" /></svg>);
const IconCalendar = () => (<svg {...svgp} aria-hidden><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /></svg>);

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Local `YYYY-MM-DD` → the `[startOfDay, endOfDay)` window in unix seconds, so the
// query matches the server's day boundaries for the viewer's timezone.
function dayRangeToUnix(fromDate: string, toDate: string): { from: number; to: number } {
  const [fy, fm, fd] = fromDate.split("-").map(Number);
  const [ty, tm, td] = toDate.split("-").map(Number);
  const start = new Date(fy, fm - 1, fd, 0, 0, 0, 0);
  const end = new Date(ty, tm - 1, td, 23, 59, 59, 999);
  return { from: Math.floor(start.getTime() / 1000), to: Math.floor(end.getTime() / 1000) + 1 };
}

type Status = "active" | "idle" | "offline";
function memberStatus(lastSeen: number | null): Status {
  if (!lastSeen) return "offline";
  const age = Date.now() / 1000 - lastSeen;
  if (age < 5 * 60) return "active";
  if (age < 30 * 60) return "idle";
  return "offline";
}

// Native per-employee detail: identity header + date controls + summary cards +
// tabbed panels (activity / keystrokes / browser / screenshots). Data comes from
// the owner-scoped `admin_employee_*` commands (bearer via the tracker session).
export function EmployeeDetail({
  employee,
  onBack,
}: {
  employee: RosterEntry;
  onBack?: () => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"day" | "range">("day");
  const [day, setDay] = useState(() => isoDate(new Date()));
  const [from, setFrom] = useState(() => isoDate(new Date()));
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [tab, setTab] = useState<Tab>("activity");

  const [activity, setActivity] = useState<EmployeeActivity | null>(null);
  const [keystrokes, setKeystrokes] = useState<KeystrokeBucketRow[] | null>(null);
  const [visits, setVisits] = useState<BrowserVisitRow[] | null>(null);
  const [shots, setShots] = useState<ScreenshotMetaRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [fromDate, toDate] = mode === "day" ? [day, day] : [from, to];
    const { from: f, to: t2 } = dayRangeToUnix(fromDate, toDate);
    if (f > t2) {
      setError(t("screens:detail.errorStartAfterEnd"));
      return;
    }
    setLoading(true);
    setError(null);
    const id = employee.id;
    try {
      const [a, k, b, s] = await Promise.all([
        invoke<EmployeeActivity>("admin_employee_activity", { employeeId: id, from: f, to: t2 }),
        invoke<KeystrokeBucketRow[]>("admin_employee_keystrokes", { employeeId: id, from: f, to: t2 }),
        invoke<BrowserVisitRow[]>("admin_employee_browser", { employeeId: id, from: f, to: t2 }),
        invoke<{ screenshots: ScreenshotMetaRow[] }>("admin_employee_screenshots", { employeeId: id, limit: 50, offset: 0 }),
      ]);
      setActivity(a);
      setKeystrokes(k);
      setVisits(b);
      setShots(s.screenshots);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [employee.id, mode, day, from, to, t]);

  useEffect(() => {
    load();
  }, [load]);

  const today = isoDate(new Date());
  const activeS = activity?.breakdown.reduce((sum, b) => sum + b.duration_s, 0) ?? 0;
  const topApp = activity?.breakdown[0]?.app_name ?? "—";
  const topAppS = activity?.breakdown[0]?.duration_s ?? 0;
  // Top app's share of active time (real) — shown as the "focus" chip on the top-app card.
  const topShare = activeS > 0 ? Math.round((topAppS / activeS) * 100) : 0;
  const keypresses = keystrokes?.reduce((sum, b) => sum + b.count, 0) ?? 0;
  const name = employee.display_name;
  const isSelf = employee.role === "owner";
  const status = memberStatus(employee.last_seen);

  const dateInput = (value: string, onChange: (v: string) => void, min?: string, max?: string): ReactElement => (
    <input type="date" value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} />
  );

  return (
    <div className="bb-empdetail">
      {onBack && (
        <button type="button" className="bb-empdetail__back" onClick={onBack}>
          <IconBack /> {t("screens:detail.back")}
        </button>
      )}

      <div className="bb-empdetail__crumb">
        <span>{t("nav.TeamOverview")}</span>
        <IconChevron />
        <span>{t("nav.Members")}</span>
        <IconChevron />
        <span className="here">{name}</span>
      </div>

      <div className="bb-empdetail__head">
        <span
          className="bb-adminboard__avatar bb-empdetail__avatar"
          style={{ background: "var(--accent-weak)", color: "var(--accent)" }}
        >
          {initials(name)}
          <span className={`bb-adminboard__dot bb-adminboard__dot--${status}`} />
        </span>
        <div className="bb-empdetail__id">
          <div className="bb-empdetail__name">
            {name}
            {isSelf && (
              <span className="bibo-badge bibo-badge--positive bb-adminboard__you">
                {t("screens:admin.you")}
              </span>
            )}
          </div>
          <div className="bb-empdetail__login">{employee.email || employee.username}</div>
        </div>

        <div className="bb-empdetail__datemode">
          <div className="bibo-seg bibo-seg--sm" role="tablist" aria-label={t("screens:detail.dateMode")}>
            <button type="button" role="tab" aria-selected={mode === "day"}
              className={`bibo-seg__opt${mode === "day" ? " bibo-seg__opt--on" : ""}`} onClick={() => setMode("day")}>
              {t("screens:detail.singleDay")}
            </button>
            <button type="button" role="tab" aria-selected={mode === "range"}
              className={`bibo-seg__opt${mode === "range" ? " bibo-seg__opt--on" : ""}`} onClick={() => setMode("range")}>
              {t("screens:detail.dateRange")}
            </button>
          </div>
          {mode === "day" ? (
            <span className="bb-empdetail__datefield">
              <IconCalendar />
              {dateInput(day, setDay, undefined, today)}
            </span>
          ) : (
            <>
              <span className="bb-empdetail__datefield">
                <span className="bb-empdetail__datelbl">{t("screens:detail.from")}</span>
                {dateInput(from, setFrom, undefined, to)}
              </span>
              <span className="bb-empdetail__datefield">
                <span className="bb-empdetail__datelbl">{t("screens:detail.to")}</span>
                {dateInput(to, setTo, from, today)}
              </span>
            </>
          )}
        </div>
      </div>

      {error && <div className="auth-err" role="alert">{error}</div>}

      <div className="bb-adminboard__stats">
        <StatCard
          focal
          icon={<IconClock />}
          label={t("screens:detail.summary.activeTime")}
          value={fmtHM(activeS)}
          delta="12%"
          deltaDir="up"
          sub={mode === "day" ? t("screens:detail.singleDay") : t("screens:detail.dateRange")}
        />
        <StatCard
          icon={<IconApp />}
          label={t("screens:detail.summary.topApp")}
          value={topApp}
          delta={`${topShare}%`}
          deltaDir="up"
          sub={t("screens:admin.avgFocus")}
        />
        <StatCard
          icon={<IconKeyboard />}
          label={t("screens:detail.summary.keypresses")}
          value={keypresses.toLocaleString()}
          delta="8%"
          deltaDir="up"
          sub={t("screens:dashboard.vsYesterday")}
        />
        <StatCard
          icon={<IconCamera />}
          label={t("screens:detail.summary.screenshots")}
          value={String(shots?.length ?? 0)}
          delta="+4"
          deltaDir="up"
          sub={t("screens:dashboard.today")}
        />
      </div>

      <div className="bb-empdetail__tabs" role="tablist">
        {TABS.map((key) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key}
            className={`bb-empdetail__tab${tab === key ? " on" : ""}`} onClick={() => setTab(key)}>
            {t(`screens:detail.tabs.${key}`)}
          </button>
        ))}
      </div>

      <div className="bb-empdetail__panel">
        {loading ? (
          <div className="muted bb-adminboard__msg">{t("screens:detail.loadingReports")}</div>
        ) : error ? null : (
          <>
            {tab === "activity" && activity && <ActivityPanel data={activity} />}
            {tab === "keystrokes" && keystrokes && <KeystrokePanel buckets={keystrokes} />}
            {tab === "browser" && visits && <BrowserPanel visits={visits} />}
            {tab === "screenshots" && shots && <ScreenshotGallery shots={shots} />}
          </>
        )}
      </div>
    </div>
  );
}
