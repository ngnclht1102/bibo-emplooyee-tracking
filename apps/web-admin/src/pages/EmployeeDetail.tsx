import { useCallback, useEffect, useState } from "react";
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
import { Card, Notice, Spinner } from "../components/ui";
import { dayRangeToUnix, fmtDuration, isoDate } from "../format";
import { useBusinesses } from "../useBusinesses";
import { memberTerms } from "../terms";

type Tab = "activity" | "keystrokes" | "browser" | "screenshots";
const TABS: Tab[] = ["activity", "keystrokes", "browser", "screenshots"];

export function EmployeeDetail() {
  const { t } = useTranslation("dashboard");
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const businessId = params.get("business");
  const { businesses } = useBusinesses();
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
    const { from: f, to: to2 } = dayRangeToUnix(fromDate, toDate);
    if (f > to2) {
      setError(t("detail.errorStartAfterEnd"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [a, k, b, s] = await Promise.all([
        reportActivity(id, f, to2),
        reportKeystrokes(id, f, to2),
        reportBrowser(id, f, to2),
        reportScreenshots(id, f, to2),
      ]);
      setActivity(a);
      setKeystrokes(k.buckets);
      setVisits(b.visits);
      setShots(s.screenshots);
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
  const keypresses = keystrokes?.reduce((sum, b) => sum + b.count, 0) ?? 0;
  const summary = [
    {
      label: mode === "day" ? t("detail.summary.activeTime") : t("detail.summary.activeTimeRange"),
      value: fmtDuration(activeS),
    },
    { label: t("detail.summary.topApp"), value: topApp },
    { label: t("detail.summary.keypresses"), value: keypresses.toLocaleString() },
    { label: t("detail.summary.screenshots"), value: (shots?.length ?? 0).toLocaleString() },
  ];

  return (
    <div>
      <div className="caption" style={{ marginBottom: 8 }}>
        <Link to="/">{t("detail.breadcrumbDashboard")}</Link> / {terms.one}
      </div>
      <div className="toolbar spread" style={{ justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "var(--fz-lg)", margin: 0 }}>
          {employee?.display_name ?? terms.one}
          {employee && (
            <span className="muted" style={{ fontSize: "var(--fz-sm)", fontWeight: 400 }}>
              {" "}
              — {employee.email || employee.username}
            </span>
          )}
        </h1>
        <div className="row" style={{ gap: 8 }}>
          <div className="segmented" role="group" aria-label={t("detail.dateMode")}>
            <button className={mode === "day" ? "active" : ""} onClick={() => setMode("day")}>
              {t("detail.day")}
            </button>
            <button className={mode === "range" ? "active" : ""} onClick={() => setMode("range")}>
              {t("detail.range")}
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
                <span className="caption">{t("detail.from")}</span>
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
                <span className="caption">{t("detail.to")}</span>
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
        <Notice kind="info">{t("detail.noBusinessContext")}</Notice>
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
        {TABS.map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {t(`detail.tabs.${key}`)}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ margin: "16px 0" }}>
          <Spinner label={t("detail.loadingReports")} />
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
