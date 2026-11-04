import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { billingApi, type TaskDetail as TaskDetailData } from "../../api/billing";
import { Empty, Notice, Spinner } from "../../components/ui";
import { ScreenshotGallery } from "../../components/reports/ScreenshotGallery";
import { StatCard } from "../Dashboard";
import { fmtDuration } from "../../format";
import { IconCamera, IconCheckList, IconChevron, IconClock, IconKeyboard, NameCell, errText, fmtDay, ic } from "./common";
import { BillingGate } from "./BillingGate";

// One task, end to end (CTR-16): who logged time on it, the screenshots captured
// while their timer ran on it, and how much of their typing those days landed here.
// Everything outside logged time is derived from the timer's wall-clock windows, so
// manually logged time contributes no screenshots or keystrokes.

/** Whole-percent share, or null when there is nothing to compare against. */
const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);
const pct = (v: number | null) => (v == null ? "—" : `${v}%`);
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function TaskDetail() {
  return <BillingGate>{(biz) => <TaskDetailInner biz={biz} />}</BillingGate>;
}

function TaskDetailInner({ biz }: { biz: string }) {
  const { t } = useTranslation("billing");
  const { id = "" } = useParams();
  const [d, setD] = useState<TaskDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    billingApi
      .taskDetail(biz, id)
      .then(setD)
      .catch((e) => setError(errText(e, t("common.loadError"))));
  }, [biz, id, t]);
  useEffect(load, [load]);

  if (!d) {
    return <div className="admin-wrap">{error ? <Notice kind="danger">{error}</Notice> : <Spinner label={t("common.loading")} />}</div>;
  }

  const { task, stats, entries, screenshots } = d;
  const totalS = stats.reduce((s, x) => s + x.seconds, 0);
  const keys = stats.reduce((s, x) => s + x.keystrokes, 0);
  const keysDay = stats.reduce((s, x) => s + x.keystrokes_day, 0);

  return (
    <div className="admin-wrap" style={{ paddingBottom: 32 }}>
      <div className="admin-crumb">
        <Link to="/billing/tasks">{t("tasks.title")}</Link>
        {ic(IconChevron)}
        <span className="admin-crumb__here">{task.title}</span>
      </div>
      <div className="admin-pagehead">
        <div className="admin-pagehead__main">
          <h1 className="admin-h1">{task.title}</h1>
          <p className="admin-sub">
            {task.project_name || t("common.noProject")} ·{" "}
            <span className={task.status === "done" ? "pill pill-success" : "pill"}>{t(`tasks.status.${task.status}`)}</span>{" "}
            {task.assignee_id ? task.assignee_name : t("tasks.unassigned")}
          </p>
        </div>
      </div>

      {error && <Notice kind="danger">{error}</Notice>}

      <div className="admin-stats">
        <StatCard focal icon={IconClock} label={t("taskDetail.logged")} value={fmtDuration(totalS)}
          sub={t("taskDetail.people", { count: stats.length })} />
        <StatCard icon={IconKeyboard} label={t("taskDetail.typing")} value={pct(share(keys, keysDay))}
          sub={t("taskDetail.typingSub")} />
        <StatCard icon={IconCamera} label={t("taskDetail.shots")} value={String(d.shot_total)}
          sub={t("taskDetail.shotsSub")} />
        <StatCard icon={IconCheckList} label={t("taskDetail.entries")} value={String(entries.length)}
          sub={t("taskDetail.entriesSub")} />
      </div>

      <div className="bill-stack">
        <Notice kind="info">{t("taskDetail.derivedHint")}</Notice>

        <div className="bibo-card bibo-card--default admin-tablecard">
          <div className="admin-panelhead">
            <div className="admin-paneltitle">{t("taskDetail.byMember")}</div>
          </div>
          {stats.length === 0 ? (
            <Empty>{t("taskDetail.noTime")}</Empty>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("taskDetail.col.member")}</th>
                  <th className="r">{t("tasks.col.logged")}</th>
                  <th className="r">{t("taskDetail.col.typing")}</th>
                  <th className="r">{t("taskDetail.col.shots")}</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((x) => (
                  <tr key={x.user_id}>
                    <td><NameCell id={x.user_id} name={x.user_name} /></td>
                    <td className="r admin-dur">{fmtDuration(x.seconds)}</td>
                    <td className="r admin-dur">
                      {pct(share(x.keystrokes, x.keystrokes_day))}
                      <span className="bill-sub">{t("taskDetail.keystrokes", { n: x.keystrokes })}</span>
                    </td>
                    <td className="r admin-dur">{x.shots}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bibo-card bibo-card--default admin-tablecard">
          <div className="admin-panelhead">
            <div className="admin-paneltitle">{t("taskDetail.entries")}</div>
          </div>
          {entries.length === 0 ? (
            <Empty>{t("taskDetail.noTime")}</Empty>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("time.col.day")}</th>
                  <th>{t("taskDetail.col.member")}</th>
                  <th className="r">{t("time.col.duration")}</th>
                  <th>{t("taskDetail.col.window")}</th>
                  <th>{t("taskDetail.col.invoice")}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td>{fmtDay(e.day)}</td>
                    <td>
                      <NameCell id={e.user_id} name={e.user_name} />
                      {e.note && <span className="bill-sub">{e.note}</span>}
                    </td>
                    <td className="r admin-dur">{fmtDuration(e.duration_s)}</td>
                    <td>
                      {e.started_at ? (
                        <span className="admin-dur">
                          {clock(e.started_at)}
                          {e.ended_at ? `–${clock(e.ended_at)}` : ""}
                        </span>
                      ) : (
                        <span className="bill-muted">{t("taskDetail.manual")}</span>
                      )}
                    </td>
                    <td>
                      {e.invoice_number ? (
                        <Link className="admin-link" to={`/billing/invoices/${e.invoice_id}`}>{e.invoice_number}</Link>
                      ) : (
                        <span className="bill-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bibo-card bibo-card--default admin-cardpad">
          <ScreenshotGallery shots={screenshots} />
        </div>
      </div>
    </div>
  );
}
