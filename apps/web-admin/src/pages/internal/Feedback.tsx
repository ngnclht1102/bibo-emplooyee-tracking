import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { adminFeedback } from "../../api/endpoints";
import type { FeedbackRow } from "../../api/types";
import { Empty, Notice, Spinner } from "../../components/ui";
import { activeLocale } from "../../i18n";

// Super-admin list of the feedback desktop users send from the app's What's new
// page (ticket 160). Read-only: newest first, "load more" paging.

const PAGE = 100;

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(activeLocale(), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Feedback() {
  const { t } = useTranslation("dashboard");
  const [rows, setRows] = useState<FeedbackRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFeedback(PAGE, 0)
      .then((r) => {
        setRows(r.feedback);
        setTotal(r.total);
      })
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  async function more() {
    if (!rows) return;
    setLoadingMore(true);
    try {
      const r = await adminFeedback(PAGE, rows.length);
      setRows([...rows, ...r.feedback]);
      setTotal(r.total);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="admin-wrap" style={{ paddingBottom: 32 }}>
      <div className="admin-pagehead">
        <div className="admin-pagehead__main">
          <h1 className="admin-h1">{t("feedback.title")}</h1>
          <p className="admin-sub">{t("feedback.sub", { total })}</p>
        </div>
      </div>

      {error && <Notice kind="danger">{error}</Notice>}
      {!rows && !error && <Spinner />}
      {rows && rows.length === 0 && <Empty>{t("feedback.empty")}</Empty>}

      {rows && rows.length > 0 && (
        <>
          <div className="bibo-card bibo-card--default admin-tablecard">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("feedback.col.when")}</th>
                  <th>{t("feedback.col.from")}</th>
                  <th>{t("feedback.col.kind")}</th>
                  <th>{t("feedback.col.message")}</th>
                  <th>{t("feedback.col.app")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => (
                  <tr key={f.id}>
                    <td className="fb-when">{fmtWhen(f.created_at)}</td>
                    <td>
                      <div>{f.account || t("feedback.noAccount")}</div>
                      {f.email && <div className="im-id">{f.email}</div>}
                    </td>
                    <td>
                      <span className={`im-status fb-kind--${f.kind}`}>{t(`feedback.kind.${f.kind}`)}</span>
                    </td>
                    <td className="fb-msg">{f.message}</td>
                    <td className="im-id">
                      {[f.app_version && `v${f.app_version}`, f.platform, f.locale].filter(Boolean).join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length < total && (
            <div className="fb-more">
              <button type="button" className="bibo-btn bibo-btn--secondary" disabled={loadingMore} onClick={more}>
                {loadingMore ? t("feedback.loading") : t("feedback.more")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
