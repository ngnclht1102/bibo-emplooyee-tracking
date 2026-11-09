import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { StatCard } from "../../ui";
import { billingApi, type Member, type OwnerProject, type OwnerTask, type TaskDetail } from "../../work/billingApi";
import { errMsg, localDay } from "../../work/useTaskTimer";
import { Dlg, Field, IconBack, IconClock, IconList, IconPlus, IconUser } from "../../work/ui";
import { ScreenshotGallery } from "./panels/ScreenshotGallery";
import { fmtHM, hhmm } from "./reportTypes";

// Billing admin, native (CTR-16): every task in the workspace, the same as
// web-admin's Billing → Tasks, plus a detail view that pulls together what the
// trackers recorded while each person's timer ran on that task — time, typing
// share and the screenshots from those windows.

type Filter = "open" | "done" | "all";

const IconCamera = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M14.5 4h-5L8 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-4z" />
    <circle cx="12" cy="13" r="3.2" />
  </svg>
);
const IconKeyboard = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
  </svg>
);

/** Share of typing that landed on the task, as a whole percent (null = no typing). */
const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);
const pct = (v: number | null) => (v == null ? "—" : `${v}%`);

export function BillingTasks({ businessId, businessName }: { businessId: string; businessName: string }) {
  const { t } = useTranslation("tasks");
  const [tasks, setTasks] = useState<OwnerTask[]>([]);
  const [projects, setProjects] = useState<OwnerProject[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [filter, setFilter] = useState<Filter>("open");
  const [projectId, setProjectId] = useState("");
  const [assignee, setAssignee] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<OwnerTask | "new" | null>(null);
  const [detail, setDetail] = useState<OwnerTask | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([billingApi.tasks(businessId), billingApi.projects(businessId), billingApi.members(businessId, localDay())])
      .then(([tk, p, m]) => {
        setTasks(tk.tasks);
        setProjects(p.projects);
        setMembers(m.members);
        setError(null);
      })
      .catch((e) => setError(errMsg(e, "")))
      .finally(() => setLoading(false));
  }, [businessId]);
  useEffect(load, [load]);

  // The workspace switcher must not leave a task from the old workspace open.
  useEffect(() => setDetail(null), [businessId]);

  if (detail) {
    return <TaskDetailView businessId={businessId} task={detail} members={members} onBack={() => { setDetail(null); load(); }} />;
  }

  const errText = error === null ? null : error || t("offline");
  const shown = tasks.filter(
    (x) =>
      (filter === "all" || x.status === filter) &&
      (!projectId || (projectId === "none" ? !x.project_id : x.project_id === projectId)) &&
      (!assignee || (assignee === "none" ? !x.assignee_id : x.assignee_id === assignee)),
  );

  return (
    <div className="bb-members">
      <div className="bb-members__head">
        <div>
          <h1 className="bb-adminboard__title">{t("admin.tasks.title")}</h1>
          <p className="bb-adminboard__who">
            {businessName} · {t("admin.tasks.openCount", { count: tasks.filter((x) => x.status === "open").length })}
          </p>
        </div>
        <div className="bb-members__actions">
          <button type="button" className="bibo-btn bibo-btn--primary bb-members__add" onClick={() => setEditing("new")}>
            <IconPlus /> {t("admin.tasks.new")}
          </button>
        </div>
      </div>

      {errText && <div className="auth-err" role="alert">{errText}</div>}
      <div className="card bb-adminboard__tablecard">
        <div className="bb-panel__head bb-task-head">
          <div className="bb-task-filters">
            <span className="bibo-input bb-timer__pick">
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">{t("admin.tasks.allProjects")}</option>
                <option value="none">{t("noProject")}</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </span>
            <span className="bibo-input bb-timer__pick">
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">{t("admin.tasks.everyone")}</option>
                <option value="none">{t("admin.tasks.unassigned")}</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </span>
            <span className="bibo-input bb-timer__pick">
              <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
                {(["open", "done", "all"] as Filter[]).map((f) => (
                  <option key={f} value={f}>{t(`admin.tasks.filter.${f}`)}</option>
                ))}
              </select>
            </span>
          </div>
        </div>
        {loading ? (
          <div className="muted bb-adminboard__msg">{t("loading")}</div>
        ) : shown.length === 0 ? (
          <div className="muted bb-adminboard__msg">{t("admin.tasks.empty")}</div>
        ) : (
          <table className="bb-adminboard__table">
            <thead>
              <tr>
                <th>{t("col.task")}</th>
                <th>{t("col.project")}</th>
                <th>{t("admin.tasks.assignee")}</th>
                <th className="r">{t("col.logged")}</th>
                <th>{t("admin.tasks.status")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((x) => (
                <tr key={x.id}>
                  <td>{x.title}</td>
                  <td>{x.project_name || <span className="muted">{t("noProject")}</span>}</td>
                  <td>{x.assignee_id ? x.assignee_name : <span className="muted">{t("admin.tasks.unassigned")}</span>}</td>
                  <td className="r num">{fmtHM(x.logged_s)}</td>
                  <td>
                    <span className={x.status === "done" ? "pill pill-success" : "pill"}>{t(`admin.tasks.status_${x.status}`)}</span>
                  </td>
                  <td className="r bb-task-actions">
                    <button type="button" className="bb-adminboard__view" onClick={() => setDetail(x)}>{t("admin.tasks.view")}</button>
                    <button type="button" className="bb-adminboard__view" onClick={() => setEditing(x)}>{t("edit")}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <TaskDialog businessId={businessId} task={editing === "new" ? null : editing} projects={projects} members={members}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}

function TaskDialog({ businessId, task, projects, members, onClose, onSaved }: {
  businessId: string; task: OwnerTask | null; projects: OwnerProject[]; members: Member[];
  onClose: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation("tasks");
  const choices = projects.filter((p) => !p.archived || p.id === task?.project_id);
  const [projectId, setProjectId] = useState(task?.project_id ?? choices[0]?.id ?? "");
  const [title, setTitle] = useState(task?.title ?? "");
  // A new task defaults to its creator — the owner works on tasks too (CTR-16).
  const [assignee, setAssignee] = useState(task ? (task.assignee_id ?? "") : (members.find((m) => m.role === "owner")?.id ?? ""));
  // Only people on the chosen project can be given its tasks (ticket 163); whoever is
  // already on the task stays listed.
  const project = choices.find((p) => p.id === projectId);
  const canWork = (m: Member) =>
    !project || m.role === "owner" || !project.restricted || project.member_ids.includes(m.id);
  const assignable = members.filter((m) => canWork(m) || m.id === task?.assignee_id);
  function pickProject(id: string) {
    setProjectId(id);
    const p = choices.find((x) => x.id === id);
    const who = members.find((m) => m.id === assignee);
    if (p && who && who.role !== "owner" && p.restricted && !p.member_ids.includes(who.id) && who.id !== task?.assignee_id) {
      setAssignee("");
    }
  }
  const [status, setStatus] = useState<string>(task?.status ?? "open");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!title.trim()) return setError(t("needTitle"));
    setBusy(true);
    try {
      await billingApi.saveTask(businessId, { id: task?.id, project_id: projectId, title, status, assignee_id: assignee || null });
      onSaved();
    } catch (e) {
      setError(errMsg(e, t("offline")));
      setBusy(false);
    }
  }
  async function remove() {
    if (!task || !window.confirm(t("admin.tasks.confirmDelete"))) return;
    try {
      await billingApi.deleteTask(businessId, task.id);
      onSaved();
    } catch (e) {
      setError(errMsg(e, t("offline")));
    }
  }

  return (
    <Dlg icon={<IconList />} title={task ? t("admin.tasks.editTitle") : t("admin.tasks.new")} onClose={onClose} onSubmit={save}
      error={error} busy={busy} submitLabel={t("save")}
      extra={task && task.logged_s === 0 && (
        <button type="button" className="bibo-btn bibo-btn--ghost" onClick={remove}>{t("delete")}</button>
      )}>
      <Field label={t("col.task")}>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("titlePlaceholder")} autoFocus />
      </Field>
      <Field label={t("col.project")}>
        <select value={projectId} onChange={(e) => pickProject(e.target.value)}>
          <option value="">{t("noProject")}</option>
          {choices.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <Field label={t("admin.tasks.assignee")}>
        <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">{t("admin.tasks.unassigned")}</option>
          {assignable.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        {project?.restricted && <span className="bb-access__hint">{t("admin.tasks.assigneeLimited")}</span>}
      </Field>
      {task && (
        <Field label={t("admin.tasks.status")}>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="open">{t("admin.tasks.status_open")}</option>
            <option value="done">{t("admin.tasks.status_done")}</option>
          </select>
        </Field>
      )}
    </Dlg>
  );
}

function TaskDetailView({ businessId, task, members, onBack }: {
  businessId: string; task: OwnerTask; members: Member[]; onBack: () => void;
}) {
  const { t } = useTranslation("tasks");
  const [d, setD] = useState<TaskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    billingApi
      .taskDetail(businessId, task.id)
      .then((x) => alive && setD(x))
      .catch((e) => alive && setError(errMsg(e, "")));
    return () => {
      alive = false;
    };
  }, [businessId, task.id]);

  const errText = error === null ? null : error || t("offline");
  const head = d?.task ?? task;
  const totalS = d ? d.stats.reduce((s, x) => s + x.seconds, 0) : head.logged_s;
  const keys = d ? d.stats.reduce((s, x) => s + x.keystrokes, 0) : 0;
  const keysDay = d ? d.stats.reduce((s, x) => s + x.keystrokes_day, 0) : 0;
  const assigneeName = head.assignee_id
    ? head.assignee_name || members.find((m) => m.id === head.assignee_id)?.name || ""
    : t("admin.tasks.unassigned");

  return (
    <div className="bb-members">
      <div className="bb-members__head">
        <div>
          <button type="button" className="bb-adminboard__view" onClick={onBack}><IconBack /> {t("admin.detail.back")}</button>
          <h1 className="bb-adminboard__title">{head.title}</h1>
          <p className="bb-adminboard__who">
            {[head.project_name || t("noProject"), assigneeName, t(`admin.tasks.status_${head.status}`)].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      {errText && <div className="auth-err" role="alert">{errText}</div>}
      {!d && !errText && <div className="muted bb-adminboard__msg">{t("loading")}</div>}

      {d && (
        <>
          <div className="bb-adminboard__stats">
            <StatCard focal icon={<IconClock />} label={t("admin.detail.logged")} value={fmtHM(totalS)}
              sub={t("admin.detail.peopleCount", { count: d.stats.length })} />
            <StatCard icon={<IconKeyboard />} label={t("admin.detail.typing")} value={pct(share(keys, keysDay))}
              sub={t("admin.detail.typingHint")} />
            <StatCard icon={<IconCamera />} label={t("admin.detail.shots")} value={String(d.shot_total)}
              sub={t("admin.detail.shotsHint")} />
            <StatCard icon={<IconUser />} label={t("admin.detail.entries")} value={String(d.entries.length)}
              sub={t("admin.detail.entriesHint")} />
          </div>

          <div className="card bb-adminboard__tablecard">
            <div className="bb-panel__head bb-task-head">
              <div className="bb-panel__title">{t("admin.detail.byMember")}</div>
            </div>
            {d.stats.length === 0 ? (
              <div className="muted bb-adminboard__msg">{t("admin.detail.noEntries")}</div>
            ) : (
              <table className="bb-adminboard__table">
                <thead>
                  <tr>
                    <th>{t("admin.detail.col.member")}</th>
                    <th className="r">{t("col.logged")}</th>
                    <th className="r">{t("admin.detail.col.typing")}</th>
                    <th className="r">{t("admin.detail.col.shots")}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.stats.map((x) => (
                    <tr key={x.user_id}>
                      <td>{x.user_name}</td>
                      <td className="r num">{fmtHM(x.seconds)}</td>
                      <td className="r num">
                        {pct(share(x.keystrokes, x.keystrokes_day))}
                        <div className="muted bb-task-sub">{t("admin.detail.keystrokes", { n: x.keystrokes })}</div>
                      </td>
                      <td className="r num">{x.shots}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card bb-adminboard__tablecard">
            <div className="bb-panel__head bb-task-head">
              <div className="bb-panel__title">{t("admin.detail.entries")}</div>
            </div>
            {d.entries.length === 0 ? (
              <div className="muted bb-adminboard__msg">{t("admin.detail.noEntries")}</div>
            ) : (
              <table className="bb-adminboard__table">
                <thead>
                  <tr>
                    <th>{t("col.day")}</th>
                    <th>{t("admin.detail.col.member")}</th>
                    <th className="r">{t("col.duration")}</th>
                    <th>{t("admin.detail.col.when")}</th>
                    <th>{t("admin.detail.col.invoice")}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.entries.map((e) => (
                    <tr key={e.id}>
                      <td className="num">{e.day}</td>
                      <td>
                        {e.user_name}
                        {e.note && <div className="muted bb-task-sub">{e.note}</div>}
                      </td>
                      <td className="r num">{fmtHM(e.duration_s)}</td>
                      <td className="num">
                        {e.started_at ? (
                          <>
                            {hhmm(Date.parse(e.started_at) / 1000)}
                            {e.ended_at && `–${hhmm(Date.parse(e.ended_at) / 1000)}`}
                          </>
                        ) : (
                          <span className="muted">{t("admin.detail.manual")}</span>
                        )}
                      </td>
                      <td>{e.invoice_number ? <span className="pill pill-success">{e.invoice_number}</span> : <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <ScreenshotGallery shots={d.screenshots} />
        </>
      )}
    </div>
  );
}
