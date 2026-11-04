import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { billingApi, type BillingMember, type Project, type Task } from "../../api/billing";
import { useAuth } from "../../auth/AuthContext";
import { Empty, Notice, Spinner } from "../../components/ui";
import { useBusinesses } from "../../useBusinesses";
import { fmtDuration } from "../../format";
import {
  Dialog, DialogFoot, IconCheckList, IconPlus, NameCell, SelectField, TextField, errText, ic, localDay,
} from "./common";
import { BillingGate } from "./BillingGate";

type Filter = "open" | "done" | "all";

/** Every task in the workspace — created here by the owner or by members in the desktop app. */
export function Tasks() {
  return <BillingGate>{(biz) => <TasksInner biz={biz} />}</BillingGate>;
}

function TasksInner({ biz }: { biz: string }) {
  const { t } = useTranslation("billing");
  const { selected } = useBusinesses();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<BillingMember[]>([]);
  const [filter, setFilter] = useState<Filter>("open");
  const [projectId, setProjectId] = useState("");
  const [assignee, setAssignee] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Task | "new" | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([billingApi.tasks(biz), billingApi.projects(biz), billingApi.members(biz, localDay())])
      .then(([tk, p, m]) => {
        setTasks(tk.tasks);
        setProjects(p.projects);
        setMembers(m.members);
      })
      .catch((e) => setError(errText(e, t("common.loadError"))))
      .finally(() => setLoading(false));
  }, [biz, t]);
  useEffect(load, [load]);

  const shown = tasks.filter(
    (x) =>
      (filter === "all" || x.status === filter) &&
      (!projectId || (projectId === "none" ? !x.project_id : x.project_id === projectId)) &&
      (!assignee || (assignee === "none" ? !x.assignee_id : x.assignee_id === assignee)),
  );

  return (
    <div className="admin-wrap" style={{ paddingBottom: 32 }}>
      <div className="admin-pagehead">
        <div className="admin-pagehead__main">
          <h1 className="admin-h1">{t("tasks.title")}</h1>
          <p className="admin-sub">
            {selected?.name} · {t("tasks.openCount", { count: tasks.filter((x) => x.status === "open").length })}
          </p>
        </div>
        <div className="admin-pagehead__actions">
          <button className="bibo-btn bibo-btn--primary" onClick={() => setEditing("new")}>
            {ic(IconPlus)}
            <span>{t("tasks.new")}</span>
          </button>
        </div>
      </div>

      <div className="bill-filters">
        <span className="admin-datefield">
          <span className="admin-datefield__lbl">{t("common.project")}</span>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">{t("common.allProjects")}</option>
            <option value="none">{t("common.noProject")}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </span>
        <span className="admin-datefield">
          <span className="admin-datefield__lbl">{t("tasks.assignee")}</span>
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">{t("common.everyone")}</option>
            <option value="none">{t("tasks.unassigned")}</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </span>
        <div className="bibo-tabs bibo-tabs--pill" role="tablist">
          {(["open", "done", "all"] as Filter[]).map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} className={`bibo-tab${filter === f ? " bibo-tab--on" : ""}`}
              onClick={() => setFilter(f)}>
              {t(`tasks.filter.${f}`)}
            </button>
          ))}
        </div>
      </div>

      {error && <Notice kind="danger">{error}</Notice>}
      {loading && <Spinner label={t("common.loading")} />}
      {!loading && shown.length === 0 && <Empty>{t("tasks.empty")}</Empty>}

      {shown.length > 0 && (
        <div className="bibo-card bibo-card--default admin-tablecard">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("tasks.col.task")}</th>
                <th>{t("common.project")}</th>
                <th>{t("tasks.assignee")}</th>
                <th className="r">{t("tasks.col.logged")}</th>
                <th>{t("tasks.col.status")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((x) => (
                <tr key={x.id}>
                  <td>
                    <Link className="admin-link" to={`/billing/tasks/${x.id}`}>{x.title}</Link>
                  </td>
                  <td>{x.project_name || <span className="bill-muted">{t("common.noProject")}</span>}</td>
                  <td>{x.assignee_id ? <NameCell id={x.assignee_id} name={x.assignee_name} /> : <span className="bill-muted">{t("tasks.unassigned")}</span>}</td>
                  <td className="r admin-dur">{fmtDuration(x.logged_s)}</td>
                  <td>
                    <span className={x.status === "done" ? "pill pill-success" : "pill"}>{t(`tasks.status.${x.status}`)}</span>
                  </td>
                  <td className="r">
                    <Link className="admin-viewlink" to={`/billing/tasks/${x.id}`}>{t("tasks.view")}</Link>{" "}
                    <button type="button" className="admin-viewlink" onClick={() => setEditing(x)}>{t("common.edit")}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <TaskDialog biz={biz} task={editing === "new" ? null : editing} projects={projects} members={members}
          me={user?.id ?? ""} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}

function TaskDialog({
  biz, task, projects, members, me, onClose, onSaved,
}: {
  biz: string;
  task: Task | null;
  projects: Project[];
  members: BillingMember[];
  /** The signed-in owner — a task they create is assigned to them unless changed. */
  me: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation("billing");
  const choices = projects.filter((p) => !p.archived || p.id === task?.project_id);
  const [projectId, setProjectId] = useState(task?.project_id ?? choices[0]?.id ?? "");
  const [title, setTitle] = useState(task?.title ?? "");
  const [assignee, setAssignee] = useState(task ? (task.assignee_id ?? "") : me);
  const [status, setStatus] = useState<string>(task?.status ?? "open");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await billingApi.saveTask(biz, { id: task?.id, project_id: projectId, title, status, assignee_id: assignee || null });
      onSaved();
    } catch (e) {
      setError(errText(e, t("common.saveError")));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!task || !window.confirm(t("tasks.confirmDelete"))) return;
    try {
      await billingApi.deleteTask(biz, task.id);
      onSaved();
    } catch (e) {
      setError(errText(e, t("common.saveError")));
    }
  }

  return (
    <Dialog icon={IconCheckList} title={task ? t("tasks.editTitle") : t("tasks.new")} onClose={onClose} onSubmit={save} error={error}
      foot={<DialogFoot onClose={onClose} busy={busy} label={t("common.save")} disabled={!title.trim()}
        extra={task && task.logged_s === 0 && <button type="button" className="bibo-btn bibo-btn--ghost" onClick={remove}>{t("common.delete")}</button>} />}>
      <TextField label={t("tasks.col.task")} value={title} onChange={setTitle} placeholder={t("tasks.titlePlaceholder")} required autoFocus />
      <SelectField label={t("common.project")} value={projectId} onChange={setProjectId}>
        <option value="">{t("common.noProject")}</option>
        {choices.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </SelectField>
      <SelectField label={t("tasks.assignee")} value={assignee} onChange={setAssignee}>
        <option value="">{t("tasks.unassigned")}</option>
        {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </SelectField>
      {task && (
        <SelectField label={t("tasks.col.status")} value={status} onChange={setStatus}>
          <option value="open">{t("tasks.status.open")}</option>
          <option value="done">{t("tasks.status.done")}</option>
        </SelectField>
      )}
    </Dialog>
  );
}
