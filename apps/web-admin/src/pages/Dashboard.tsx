import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { reportEmployees } from "../api/endpoints";
import type { ReportEmployee } from "../api/types";
import { BusinessPicker } from "../components/BusinessPicker";
import { Empty, Notice, Spinner } from "../components/ui";
import { fmtDuration, fmtRelative } from "../format";
import { useBusinesses } from "../useBusinesses";

export function Dashboard() {
  const { businesses, selectedId, setSelectedId, loading: bizLoading } = useBusinesses();
  const [rows, setRows] = useState<ReportEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    reportEmployees(selectedId)
      .then((r) => !cancelled && setRows(r.employees))
      .catch(() => !cancelled && setError("Could not load the roster."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  return (
    <div>
      <div className="toolbar spread" style={{ justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "var(--fz-lg)", margin: 0 }}>Dashboard</h1>
        <BusinessPicker businesses={businesses} selectedId={selectedId} onChange={setSelectedId} />
      </div>

      {bizLoading && <Spinner label="Loading businesses…" />}

      {!bizLoading && businesses.length === 0 && (
        <Empty>
          No businesses yet. Go to <Link to="/employees">Employees</Link> to add your first
          employee — a business is created automatically.
        </Empty>
      )}

      {error && <Notice kind="danger">{error}</Notice>}
      {loading && <Spinner label="Loading roster…" />}

      {!loading && !error && selectedId && rows.length === 0 && (
        <Empty>No employees have synced activity yet.</Empty>
      )}

      {rows.length > 0 && (
        <table className="num">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Email</th>
              <th>Last seen</th>
              <th style={{ textAlign: "right" }}>Active today</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td style={{ fontWeight: 500 }}>{e.display_name}</td>
                <td className="muted">{e.email}</td>
                <td className="muted">{fmtRelative(e.last_seen)}</td>
                <td style={{ textAlign: "right" }}>{fmtDuration(e.active_today_s)}</td>
                <td style={{ textAlign: "right" }}>
                  <Link to={`/employees/${e.id}?business=${selectedId}`}>View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
