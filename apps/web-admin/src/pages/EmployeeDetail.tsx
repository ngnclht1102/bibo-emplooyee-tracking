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
import { Card, Notice, SectionTitle, Spinner } from "../components/ui";
import { dayRangeToUnix, daysAgoIso, isoDate } from "../format";

export function EmployeeDetail() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const businessId = params.get("business");

  const [from, setFrom] = useState(() => daysAgoIso(6));
  const [to, setTo] = useState(() => isoDate(new Date()));

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
    const { from: f, to: t } = dayRangeToUnix(from, to);
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
  }, [id, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="caption" style={{ marginBottom: 8 }}>
        <Link to="/">Dashboard</Link> / Employee
      </div>
      <div className="toolbar spread" style={{ justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "var(--fz-lg)", margin: 0 }}>
          {employee?.display_name ?? "Employee"}
          {employee && <span className="muted" style={{ fontSize: "var(--fz-sm)", fontWeight: 400 }}> — {employee.email}</span>}
        </h1>
        <div className="row" style={{ gap: 8 }}>
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
              max={isoDate(new Date())}
              onChange={(e) => setTo(e.target.value)}
              style={{ width: "auto" }}
            />
          </label>
        </div>
      </div>

      {!businessId && (
        <Notice kind="info">
          Open this page from the Dashboard or Employees list so the business context is known.
        </Notice>
      )}
      {error && <Notice kind="danger">{error}</Notice>}
      {loading && (
        <div style={{ margin: "16px 0" }}>
          <Spinner label="Loading reports…" />
        </div>
      )}

      {!loading && !error && (
        <>
          <SectionTitle>Activity & app breakdown</SectionTitle>
          <Card>{activity ? <ActivityPanel data={activity} /> : <Spinner />}</Card>

          <SectionTitle>Keystrokes</SectionTitle>
          <Card>{keystrokes ? <KeystrokePanel buckets={keystrokes} /> : <Spinner />}</Card>

          <SectionTitle>Browser visits</SectionTitle>
          <Card>{visits ? <BrowserPanel visits={visits} /> : <Spinner />}</Card>

          <SectionTitle>Screenshots</SectionTitle>
          <Card>{shots ? <ScreenshotGallery shots={shots} /> : <Spinner />}</Card>
        </>
      )}
    </div>
  );
}
