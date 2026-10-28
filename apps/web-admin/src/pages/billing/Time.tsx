import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { billingApi, type BillingMember, type Project, type Task, type TimeEntry, type TrackedDay } from "../../api/billing";
import { Empty, Notice, Spinner } from "../../components/ui";
import { useBusinesses } from "../../useBusinesses";
import { fmtDuration } from "../../format";
import { StatCard } from "../Dashboard";
import {
  Dialog, DialogFoot, IconClock, IconCoins, IconPlus, IconReceipt, IconCheckList, NameCell, Row2, SelectField,
  TextField, TextArea, errText, fmtDay, fmtMoney, ic, localDay, parseDuration, startOfWeek, toHm,
} from "./common";
import { BillingGate } from "./BillingGate";

/** Owner view of logged time: filter by period/person/project, log or fix time,
 *  and compare logged hours with automatically tracked hours. */
export function Time() {
  return <BillingGate>{(biz) => <TimeInner biz={biz} />}</BillingGate>;
}

function TimeInner({ biz }: { biz: string }) {
  const { t } = useTranslation("billing");
  const { selected } = useBusinesses();
  const [from, setFrom] = useState(startOfWeek());
  const [to, setTo] = useState(localDay());
  const [userId, setUserId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [tracked, setTracked] = useState<TrackedDay[]>([]);
  const [members, setMembers] = useState<BillingMember[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TimeEntry | "new" | null>(null);

  useEffect(() => {
    Promise.all([billingApi.members(biz, localDay()), billingApi.projects(biz), billingApi.tasks(biz), billingApi.settings(biz)])
      .then(([m, p, tk, s]) => {
        setMembers(m.members);
        setProjects(p.projects);
        setTasks(tk.tasks);
        setCurrency(s.currency);
      })
      .catch((e) => setError(errText(e, t("common.loadError"))));
  }, [biz, t]);

  const load = useCallback(() => {
    if (!from || !to || to < from) return;
    setLoading(true);
    setError(null);
    Promise.all([
      billingApi.entries(biz, { from, to, user_id: userId || undefined, project_id: projectId || undefined }),
      billingApi.tracked(biz, from, to),
    ])
      .then(([e, tr]) => {
        setEntries(e.entries);
        setTracked(tr.tracked);
      })
      .catch((e) => setError(errText(e, t("common.loadError"))))
      .finally(() => setLoading(false));
  }, [biz, from, to, userId, projectId, t]);
  useEffect(load, [load]);

  const rateOf = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m.rate_cents])), [members]);
  const projectRate = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p.rate_cents])), [projects]);

  const loggedS = entries.reduce((s, e) => s + e.duration_s, 0);
  const billable = entries.filter((e) => e.billable);
  const billableS = billable.reduce((s, e) => s + e.duration_s, 0);
  const unbilled = billable.filter((e) => !e.invoice_id);
  // Estimate at today's rates; the invoice freezes the rate in force on each day.
  const unbilledCents = unbilled.reduce(
    (s, e) => s + Math.round((e.duration_s * (projectRate[e.project_id] ?? rateOf[e.user_id] ?? 0)) / 3600),
    0,
  );
  const trackedS = tracked
    .filter((d) => !userId || d.user_id === userId)
    .reduce((s, d) => s + d.seconds, 0);

  // Logged vs tracked per person for the period.
  const perPerson = members
    .filter((m) => !userId || m.id === userId)
    .map((m) => ({
      m,
      logged: entries.filter((e) => e.user_id === m.id).reduce((s, e) => s + e.duration_s, 0),
      tracked: tracked.filter((d) => d.user_id === m.id).reduce((s, d) => s + d.seconds, 0),
    }))
    .filter((r) => r.logged > 0 || r.tracked > 0);

  return (
    <div className="admin-wrap" style={{ paddingBottom: 32 }}>
      <div className="admin-pagehead">
        <div className="admin-pagehead__main">
          <h1 className="admin-h1">{t("time.title")}</h1>
          <p className="admin-sub">
            {selected?.name} · {t("time.entryCount", { count: entries.length })}
          </p>
        </div>
        <div className="admin-pagehead__actions">
          <button className="bibo-btn bibo-btn--primary" onClick={() => setEditing("new")} disabled={tasks.length === 0}>
            {ic(IconPlus)}
            <span>{t("time.logTime")}</span>
          </button>
        </div>
      </div>

      <div className="bill-filters">
        <span className="admin-datefield">
          <span className="admin-datefield__lbl">{t("common.from")}</span>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </span>
        <span className="admin-datefield">
          <span className="admin-datefield__lbl">{t("common.to")}</span>
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </span>
        <span className="admin-datefield">
          <span className="admin-datefield__lbl">{t("common.person")}</span>
          <select value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">{t("common.everyone")}</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </span>
        <span className="admin-datefield">
          <span className="admin-datefield__lbl">{t("common.project")}</span>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">{t("common.allProjects")}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </span>
      </div>

      {error && <Notice kind="danger">{error}</Notice>}
      {tasks.length === 0 && !loading && <Notice kind="info">{t("time.needTask")}</Notice>}

      <div className="admin-stats">
        <StatCard focal icon={IconClock} label={t("time.statLogged")} value={fmtDuration(loggedS)} sub={t("time.inPeriod")} />
        <StatCard icon={IconCheckList} label={t("time.statBillable")} value={fmtDuration(billableS)}
          sub={loggedS ? t("time.pctOfLogged", { pct: Math.round((billableS / loggedS) * 100) }) : t("time.inPeriod")} />
        <StatCard icon={IconCoins} label={t("time.statUnbilled")} value={fmtMoney(unbilledCents, currency)}
          sub={t("time.unbilledSub", { count: unbilled.length })} />
        <StatCard icon={IconReceipt} label={t("time.statTracked")} value={fmtDuration(trackedS)} sub={t("time.trackedSub")} />
      </div>

      {loading && <Spinner label={t("common.loading")} />}
      {!loading && entries.length === 0 && !error && <Empty>{t("time.empty")}</Empty>}

      {entries.length > 0 && (
        <div className="bibo-card bibo-card--default admin-tablecard">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("time.col.day")}</th>
                <th>{t("common.person")}</th>
                <th>{t("time.col.task")}</th>
                <th>{t("time.col.note")}</th>
                <th className="r">{t("time.col.duration")}</th>
                <th>{t("time.col.billing")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="admin-relt">{fmtDay(e.day)}</td>
                  <td><NameCell id={e.user_id} name={e.user_name} /></td>
                  <td>
                    {e.task_title}
                    <span className="bill-sub">{e.project_name}</span>
                  </td>
                  <td className="bill-muted">{e.note}{e.source === "timer" && <span className="bill-sub">{t("time.fromTimer")}</span>}</td>
                  <td className="r admin-dur">{fmtDuration(e.duration_s)}</td>
                  <td>
                    {e.invoice_id ? (
                      <span className="pill pill-success">{t("time.billed", { number: e.invoice_number })}</span>
                    ) : e.billable ? (
                      <span className="pill pill-warn">{t("time.unbilled")}</span>
                    ) : (
                      <span className="pill">{t("time.notBillable")}</span>
                    )}
                  </td>
                  <td className="r">
                    {!e.invoice_id && (
                      <button type="button" className="admin-viewlink" onClick={() => setEditing(e)}>
                        {t("common.edit")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {perPerson.length > 0 && (
        <div className="bill-section">
          <div className="admin-set-sec">{t("time.compareTitle")}</div>
          <div className="bibo-card bibo-card--default admin-tablecard">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("common.person")}</th>
                  <th className="r">{t("time.col.logged")}</th>
                  <th className="r">{t("time.col.tracked")}</th>
                  <th className="r">{t("time.col.difference")}</th>
                </tr>
              </thead>
              <tbody>
                {perPerson.map(({ m, logged, tracked: tr }) => {
                  const diff = logged - tr;
                  return (
                    <tr key={m.id}>
                      <td><NameCell id={m.id} name={m.name} /></td>
                      <td className="r admin-dur">{fmtDuration(logged)}</td>
                      <td className="r admin-dur">{fmtDuration(tr)}</td>
                      <td className="r">
                        {diff > 15 * 60 ? (
                          <span className="pill pill-warn">{t("time.moreLogged", { d: fmtDuration(diff) })}</span>
                        ) : (
                          <span className="bill-muted">{diff < 0 ? `−${fmtDuration(-diff)}` : t("time.matches")}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="bill-hint">{t("time.compareHint")}</p>
        </div>
      )}

      {editing && (
        <EntryDialog
          biz={biz}
          entry={editing === "new" ? null : editing}
          members={members}
          tasks={tasks}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function EntryDialog({
  biz, entry, members, tasks, onClose, onSaved,
}: {
  biz: string;
  entry: TimeEntry | null;
  members: BillingMember[];
  tasks: Task[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation("billing");
  const open = tasks.filter((x) => x.status === "open" || x.id === entry?.task_id);
  const [userId, setUserId] = useState(entry?.user_id ?? members[0]?.id ?? "");
  const [taskId, setTaskId] = useState(entry?.task_id ?? open[0]?.id ?? "");
  const [day, setDay] = useState(entry?.day ?? localDay());
  const [dur, setDur] = useState(entry ? toHm(entry.duration_s) : "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const secs = parseDuration(dur);
    if (secs == null) return setError(t("time.badDuration"));
    setBusy(true);
    setError(null);
    try {
      await billingApi.saveEntry(biz, { id: entry?.id, user_id: userId, task_id: taskId, day, duration_s: secs, note });
      onSaved();
    } catch (e) {
      setError(errText(e, t("common.saveError")));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!entry || !window.confirm(t("time.confirmDelete"))) return;
    try {
      await billingApi.deleteEntry(biz, entry.id);
      onSaved();
    } catch (e) {
      setError(errText(e, t("common.saveError")));
    }
  }

  return (
    <Dialog icon={IconClock} title={entry ? t("time.editTitle") : t("time.logTime")} onClose={onClose} onSubmit={save} error={error}
      foot={<DialogFoot onClose={onClose} busy={busy} label={t("common.save")} disabled={!taskId || !dur}
        extra={entry && <button type="button" className="bibo-btn bibo-btn--ghost" onClick={remove}>{t("common.delete")}</button>} />}>
      <SelectField label={t("common.person")} value={userId} onChange={setUserId}>
        {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </SelectField>
      <SelectField label={t("time.col.task")} value={taskId} onChange={setTaskId} required>
        {open.map((x) => <option key={x.id} value={x.id}>{x.project_name} · {x.title}</option>)}
      </SelectField>
      <Row2>
        <TextField label={t("time.col.day")} type="date" value={day} onChange={setDay} required />
        <TextField label={t("time.col.duration")} value={dur} onChange={setDur} placeholder="1:30" hint={t("time.durationHint")} required />
      </Row2>
      <TextArea label={t("time.col.note")} value={note} onChange={setNote} rows={2} />
    </Dialog>
  );
}
