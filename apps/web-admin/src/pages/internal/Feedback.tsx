import { Fragment, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { adminFeedback, adminFeedbackReply } from "../../api/endpoints";
import type { FeedbackRow } from "../../api/types";
import { Empty, Notice, Spinner } from "../../components/ui";
import { activeLocale } from "../../i18n";

// Super-admin list of the feedback desktop users send from the app's What's new
// page (ticket 160). Newest first, "load more" paging. Each row can be answered
// inline (ticket 165) — the sender sees the reply in the desktop app, and editing
// one notifies them again. Rows with no account can't be answered: there is nobody
// to notify.

const PAGE = 100;
const MAX_REPLY = 4000;

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
  // Row being answered, and the draft in its editor.
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

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

  function openEditor(f: FeedbackRow) {
    setEditing(f.id);
    setDraft(f.reply);
  }

  async function save(id: number) {
    setSaving(true);
    try {
      const reply = draft.trim();
      await adminFeedbackReply(id, reply);
      const at = new Date().toISOString();
      setRows((rs) =>
        (rs ?? []).map((r) => (r.id === id ? { ...r, reply, replied_at: reply ? at : "" } : r)),
      );
      setEditing(null);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setSaving(false);
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
                  <th>{t("feedback.col.reply")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => (
                  <Fragment key={f.id}>
                    <tr>
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
                      <td>
                        {!f.account ? (
                          <span className="im-id">{t("feedback.reply.noAccount")}</span>
                        ) : f.reply ? (
                          <>
                            <div className="fb-reply">{f.reply}</div>
                            <div className="im-id">{fmtWhen(f.replied_at)}</div>
                            <button type="button" className="admin-viewlink" onClick={() => openEditor(f)}>
                              {t("feedback.reply.edit")}
                            </button>
                          </>
                        ) : (
                          <button type="button" className="admin-viewlink" onClick={() => openEditor(f)}>
                            {t("feedback.reply.action")}
                          </button>
                        )}
                      </td>
                    </tr>
                    {editing === f.id && (
                      <tr className="fb-editrow">
                        <td colSpan={6}>
                          <div className="fb-editor">
                            <textarea
                              className="im-textarea"
                              rows={4}
                              maxLength={MAX_REPLY}
                              autoFocus
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              placeholder={t("feedback.reply.placeholder")}
                            />
                            <div className="fb-editor__foot">
                              <span className="im-id">{t("feedback.reply.hint")}</span>
                              <div className="fb-editor__btns">
                                <button
                                  type="button"
                                  className="bibo-btn bibo-btn--ghost bibo-btn--sm"
                                  disabled={saving}
                                  onClick={() => setEditing(null)}
                                >
                                  {t("feedback.reply.cancel")}
                                </button>
                                <button
                                  type="button"
                                  className="bibo-btn bibo-btn--primary bibo-btn--sm"
                                  disabled={saving}
                                  onClick={() => save(f.id)}
                                >
                                  {saving ? t("feedback.reply.saving") : t("feedback.reply.save")}
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
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
