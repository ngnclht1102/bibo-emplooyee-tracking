import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
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
import { Card, Notice, Spinner } from "../components/ui";
import { dayRangeToUnix, fmtDuration, isoDate } from "../format";

type Tab = "activity" | "keystrokes" | "browser" | "screenshots";
const TABS: { key: Tab; label: string }[] = [
  { key: "activity", label: "Activity" },
  { key: "keystrokes", label: "Keystrokes" },
  { key: "browser", label: "Browser" },
  { key: "screenshots", label: "Screenshots" },
];

export function EmployeeDetail() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const businessId = params.get("business");

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

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve the employee's identity from the roster (for the header).
  useEffect(() => {
    if (!businessId) return;
    reportEmployees(businessId)
      .then((r) => setEmployee(r.employees.find((e) => e.id === id) ?? null))
      .catch(() => {});
  }, [businessId, id]);

  const load = useCallback(async () => {
    if (!id) return;
    const [fromDate, toDate] = mode === "day" ? [day, day] : [from, to];
    const { from: f, to: t } = dayRangeToUnix(fromDate, toDate);
    if (f > t) {
      setError("The start date is after the end date.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [a, k, b, s] = await Promise.all([
        reportActivity(id, f, t),
        reportKeystrokes(id, f, t),
        reportBrowser(id, f, t),
        reportScreenshots(id, f, t),
      ]);
      setActivity(a);
      setKeystrokes(k.buckets);
      setVisits(b.visits);
      setShots(s.screenshots);
    } catch {
      setError("Could not load reports for this range.");
    } finally {
      setLoading(false);
    }
  }, [id, mode, day, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const today = isoDate(new Date());

  // Summary stats for the selected day/range, derived from the loaded data.
  const activeS = activity?.breakdown.reduce((sum, b) => sum + b.duration_s, 0) ?? 0;
  const topApp = activity?.breakdown[0]?.app_name ?? "—";
  const keypresses = keystrokes?.reduce((sum, b) => sum + b.count, 0) ?? 0;
  const summary = [
    { label: mode === "day" ? "Active time" : "Active time (range)", value: fmtDuration(activeS) },
    { label: "Top app", value: topApp },
    { label: "Keypresses", value: keypresses.toLocaleString() },
    { label: "Screenshots", value: (shots?.length ?? 0).toLocaleString() },
  ];

  return (
    <div>
      <div className="caption" style={{ marginBottom: 8 }}>
        <Link to="/">Dashboard</Link> / Employee
      </div>
      <div className="toolbar spread" style={{ justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "var(--fz-lg)", margin: 0 }}>
          {employee?.display_name ?? "Employee"}
          {employee && (
            <span className="muted" style={{ fontSize: "var(--fz-sm)", fontWeight: 400 }}>
              {" "}
              — {employee.email}
            </span>
          )}
        </h1>
        <div className="row" style={{ gap: 8 }}>
          <div className="segmented" role="group" aria-label="Date mode">
            <button className={mode === "day" ? "active" : ""} onClick={() => setMode("day")}>
              Day
            </button>
            <button className={mode === "range" ? "active" : ""} onClick={() => setMode("range")}>
              Range
            </button>
          </div>

          {mode === "day" ? (
            <input
              className="input"
              type="date"
              value={day}
              max={today}
              onChange={(e) => setDay(e.target.value)}
              style={{ width: "auto" }}
            />
          ) : (
            <>
              <label className="row" style={{ gap: 6 }}>
                <span className="caption">From</span>
                <input
                  className="input"
                  type="date"
                  value={from}
                  max={to}
                  onChange={(e) => setFrom(e.target.value)}
                  style={{ width: "auto" }}
                />
              </label>
              <label className="row" style={{ gap: 6 }}>
                <span className="caption">To</span>
                <input
                  className="input"
                  type="date"
                  value={to}
                  min={from}
                  max={today}
                  onChange={(e) => setTo(e.target.value)}
                  style={{ width: "auto" }}
                />
              </label>
            </>
          )}
        </div>
      </div>

      {!businessId && (
        <Notice kind="info">
          Open this page from the Dashboard or Employees list so the business context is known.
        </Notice>
      )}
      {error && <Notice kind="danger">{error}</Notice>}

      <div className="stat-grid">
        {summary.map((s) => (
          <Card key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value num">{s.value}</div>
          </Card>
        ))}
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={tab === t.key ? "active" : ""}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ margin: "16px 0" }}>
          <Spinner label="Loading reports…" />
        </div>
      ) : (
        !error && (
          <Card>
            {tab === "activity" &&
              (activity ? <ActivityPanel data={activity} /> : <Spinner />)}
            {tab === "keystrokes" &&
              (keystrokes ? <KeystrokePanel buckets={keystrokes} /> : <Spinner />)}
            {tab === "browser" && (visits ? <BrowserPanel visits={visits} /> : <Spinner />)}
            {tab === "screenshots" &&
              (shots ? <ScreenshotGallery shots={shots} /> : <Spinner />)}
          </Card>
        )
      )}
    </div>
  );
}
