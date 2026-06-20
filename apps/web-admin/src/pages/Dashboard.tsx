import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { reportEmployees } from "../api/endpoints";
import type { ReportEmployee } from "../api/types";
import { BusinessPicker } from "../components/BusinessPicker";
import { Empty, Notice, Spinner } from "../components/ui";
import { fmtDuration, fmtRelative } from "../format";
import { useBusinesses } from "../useBusinesses";
import { memberTerms } from "../terms";
import { useAuth } from "../auth/AuthContext";

export function Dashboard() {
  const { t } = useTranslation("dashboard");
  const { user } = useAuth();
  const { businesses, selected, selectedId, setSelectedId, loading: bizLoading } = useBusinesses();
  const terms = memberTerms(selected?.kind);
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
      .catch(() => !cancelled && setError(t("dashboard.errorRoster")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  return (
    <div>
      <div className="toolbar spread" style={{ justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "var(--fz-lg)", margin: 0 }}>{t("dashboard.title")}</h1>
        <BusinessPicker businesses={businesses} selectedId={selectedId} onChange={setSelectedId} />
      </div>

      {bizLoading && <Spinner label={t("dashboard.loadingBusinesses")} />}

      {!bizLoading && businesses.length === 0 && (
        <Empty>
          <Trans
            i18nKey="dashboard.noBusinesses"
            t={t}
            values={{ members: terms.many, member: terms.lowerOne }}
            components={[<Link to="/employees" />]}
          />
        </Empty>
      )}

      {error && <Notice kind="danger">{error}</Notice>}
      {loading && <Spinner label={t("dashboard.loadingRoster")} />}

      {!loading && !error && selectedId && rows.length === 0 && (
        <Empty>{t("dashboard.noActivity", { members: terms.lowerMany })}</Empty>
      )}

      {rows.length > 0 && (
        <table className="num">
          <thead>
            <tr>
              <th>{terms.one}</th>
              <th>{t("dashboard.table.login")}</th>
              <th>{t("dashboard.table.lastSeen")}</th>
              <th style={{ textAlign: "right" }}>{t("dashboard.table.activeToday")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const isSelf = e.role === "owner" || e.id === user?.id;
              return (
              <tr key={e.id}>
                <td style={{ fontWeight: 500 }}>
                  {e.display_name}
                  {isSelf && <span className="self-badge">{t("dashboard.selfBadge")}</span>}
                </td>
                <td className="muted">{e.email || e.username}</td>
                <td className="muted">{fmtRelative(e.last_seen)}</td>
                <td style={{ textAlign: "right" }}>{fmtDuration(e.active_today_s)}</td>
                <td style={{ textAlign: "right" }}>
                  <Link to={`/employees/${e.id}?business=${selectedId}`}>{t("dashboard.view")}</Link>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
