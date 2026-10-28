import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  errMsg, localDay, myTasks, work, type Entry, type Project, type Task, type TaskTimer,
} from "../work/useTaskTimer";
import { Dlg, IconClock, IconList, IconPlay, IconPlus, IconStop } from "../work/ui";

// Billing (ticket 152): the member side. Pick a task and run a timer (only active
// time is logged — idle and paused time are left out, using this machine's own
// tracking), or log time by hand; create tasks in the team's projects. What this
// time is worth, and invoicing it to the workspace, lives on the Invoices screen
// (ticket 159). The timer itself lives in useTaskTimer, above this screen, so the
// menu bar can drive it (CTR-16).

const pad = (n: number) => String(n).padStart(2, "0");
const fmtClock = (s: number) => `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
function fmtDur(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}
function parseDuration(s: string): number | null {
  const v = s.trim().toLowerCase().replace(",", ".");
  let secs: number | null = null;
  let m: RegExpMatchArray | null;
  if ((m = v.match(/^(\d+):([0-5]?\d)$/))) secs = +m[1] * 3600 + +m[2] * 60;
  else if ((m = v.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m)?$/)) && (m[1] || m[2])) secs = Math.round(+(m[1] ?? 0) * 3600) + +(m[2] ?? 0) * 60;
  else if (/^\d+(\.\d+)?$/.test(v)) secs = Math.round(+v * 3600);
  return secs != null && secs > 0 && secs <= 86400 ? secs : null;
}
const toHm = (s: number) => `${Math.floor(s / 3600)}:${pad(Math.round((s % 3600) / 60))}`;

export function Tasks({ tt }: { tt: TaskTimer }) {
  const { t } = useTranslation("tasks");
  const { ctx, entries, timer, error, notice, start, stop, setStatus, reload } = tt;
  const [now, setNow] = useState(Date.now());
  const [showTeam, setShowTeam] = useState(false);
  const [pick, setPick] = useState("");
  const [dialog, setDialog] = useState<"task" | "time" | Entry | null>(null);

  useEffect(() => {
    if (!timer) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timer]);

  const errText = error === null ? null : error || t("offline");
  if (errText && !ctx) {
    return <div className="card bb-adminboard__tablecard"><div className="muted bb-adminboard__msg">{errText}</div></div>;
  }
  if (!ctx) return <div className="muted bb-adminboard__msg">{t("loading")}</div>;

  const me = ctx.user_id;
  const mine = myTasks(ctx);
  const team = ctx.tasks.filter((x) => x.status === "open" && !mine.includes(x));
  const shown = showTeam ? [...mine, ...team] : mine;
  const weekS = entries.reduce((s, e) => s + e.duration_s, 0);
  const todayS = entries.filter((e) => e.day === localDay()).reduce((s, e) => s + e.duration_s, 0);
  const openTasks = ctx.tasks.filter((x) => x.status === "open");

  return (
    <div className="bb-members">
      <div className="bb-members__head">
        <div>
          <h1 className="bb-adminboard__title">{t("title")}</h1>
          <p className="bb-adminboard__who">
            {t("summary", { today: fmtDur(todayS), week: fmtDur(weekS) })}
          </p>
        </div>
        <div className="bb-members__actions">
          <button type="button" className="bibo-btn bibo-btn--secondary bb-members__add" onClick={() => setDialog("time")} disabled={openTasks.length === 0}>
            <IconPlus /> {t("logTime")}
          </button>
          <button type="button" className="bibo-btn bibo-btn--primary bb-members__add" onClick={() => setDialog("task")} disabled={ctx.projects.length === 0}>
            <IconPlus /> {t("newTask")}
          </button>
        </div>
      </div>

      {errText && <div className="auth-err" role="alert">{errText}</div>}
      {notice && (
        <div className="bb-task-notice" role="status">
          {t(notice.key, { d: notice.seconds != null ? fmtDur(notice.seconds) : "", task: notice.task ?? "" })}
        </div>
      )}
      {ctx.projects.length === 0 && <div className="card bb-adminboard__tablecard"><div className="muted bb-adminboard__msg">{t("noProjects")}</div></div>}

      {/* timer */}
      <div className={`card bb-timer${timer ? " is-running" : ""}`}>
        <span className="bb-timer__ic"><IconClock /></span>
        {timer ? (
          <>
            <div className="bb-timer__what">
              <div className="bb-timer__title">{timer.title}</div>
              <div className="muted">{timer.project} · {t("timer.idleNote")}</div>
            </div>
            <div className="bb-timer__clock num">{fmtClock(Math.max(0, Math.floor((now - timer.startedAt) / 1000)))}</div>
            <button type="button" className="bibo-btn bibo-btn--primary" onClick={stop}><IconStop /> {t("timer.stop")}</button>
          </>
        ) : (
          <>
            <span className="bibo-input bb-timer__pick">
              <select value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">{t("timer.pick")}</option>
                {[...mine, ...team].map((x) => <option key={x.id} value={x.id}>{x.project_name} · {x.title}</option>)}
              </select>
            </span>
            <button type="button" className="bibo-btn bibo-btn--primary" disabled={!pick}
              onClick={() => { const tk = ctx.tasks.find((x) => x.id === pick); if (tk) start(tk); }}>
              <IconPlay /> {t("timer.start")}
            </button>
          </>
        )}
      </div>

      {/* tasks */}
      <div className="card bb-adminboard__tablecard">
        <div className="bb-panel__head bb-task-head">
          <div className="bb-panel__title">{showTeam ? t("allOpen") : t("myTasks")}</div>
          <label className="bb-task-check">
            <input type="checkbox" checked={showTeam} onChange={(e) => setShowTeam(e.target.checked)} />
            {t("showTeam")}
          </label>
        </div>
        {shown.length === 0 ? (
          <div className="muted bb-adminboard__msg">{t("noTasks")}</div>
        ) : (
          <table className="bb-adminboard__table">
            <thead>
              <tr>
                <th>{t("col.task")}</th>
                <th>{t("col.project")}</th>
                <th className="r">{t("col.logged")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((x) => (
                <tr key={x.id}>
                  <td>
                    {x.title}
                    {x.assignee_id && x.assignee_id !== me && <div className="muted bb-task-sub">{x.assignee_name}</div>}
                  </td>
                  <td>{x.project_name}</td>
                  <td className="r num">{fmtDur(x.logged_s)}</td>
                  <td className="r bb-task-actions">
                    <button type="button" className="bb-adminboard__view" disabled={!!timer} onClick={() => start(x)}>
                      <IconPlay /> {t("timer.start")}
                    </button>
                    {(x.assignee_id === me || x.created_by === me) && (
                      <button type="button" className="bb-adminboard__view" onClick={() => setStatus(x, "done")}>{t("markDone")}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* my time this week */}
      <div className="card bb-adminboard__tablecard">
        <div className="bb-panel__head bb-task-head">
          <div className="bb-panel__title">{t("thisWeek")}</div>
        </div>
        {entries.length === 0 ? (
          <div className="muted bb-adminboard__msg">{t("noTime")}</div>
        ) : (
          <table className="bb-adminboard__table">
            <thead>
              <tr>
                <th>{t("col.day")}</th>
                <th>{t("col.task")}</th>
                <th className="r">{t("col.duration")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="num">{e.day}</td>
                  <td>
                    {e.task_title}
                    <div className="muted bb-task-sub">{[e.project_name, e.note, e.source === "timer" ? t("fromTimer") : ""].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td className="r num">{fmtDur(e.duration_s)}</td>
                  <td className="r">
                    {e.invoice_id ? (
                      <span className="pill pill-success">{t("billed")}</span>
                    ) : (
                      <button type="button" className="bb-adminboard__view" onClick={() => setDialog(e)}>{t("edit")}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {dialog === "task" && (
        <TaskDialog projects={ctx.projects} onClose={() => setDialog(null)}
          onSaved={(task) => { setDialog(null); reload(); setPick(task.id); }} />
      )}
      {(dialog === "time" || (dialog && typeof dialog === "object")) && (
        <TimeDialog tasks={openTasks} entry={typeof dialog === "object" ? dialog : null}
          onClose={() => setDialog(null)} onSaved={() => { setDialog(null); reload(); }} />
      )}
    </div>
  );
}

function TaskDialog({ projects, onClose, onSaved }: { projects: Project[]; onClose: () => void; onSaved: (t: Task) => void }) {
  const { t } = useTranslation("tasks");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (!title.trim()) return setError(t("needTitle"));
    setBusy(true);
    try {
      onSaved(await work<Task>("POST", "tasks", { body: { project_id: projectId, title } }));
    } catch (e) {
      setError(errMsg(e, t("offline")));
      setBusy(false);
    }
  }
  return (
    <Dlg icon={<IconList />} title={t("newTask")} onClose={onClose} onSubmit={save} error={error} busy={busy} submitLabel={t("create")}>
      <label className="bibo-field">
        <span className="bibo-field__lbl">{t("col.project")}</span>
        <span className="bibo-input">
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </span>
      </label>
      <label className="bibo-field">
        <span className="bibo-field__lbl">{t("col.task")}</span>
        <span className="bibo-input">
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("titlePlaceholder")} autoFocus />
        </span>
      </label>
    </Dlg>
  );
}

function TimeDialog({ tasks, entry, onClose, onSaved }: { tasks: Task[]; entry: Entry | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation("tasks");
  const choices = entry && !tasks.some((x) => x.id === entry.task_id)
    ? [{ id: entry.task_id, title: entry.task_title, project_name: entry.project_name } as Task, ...tasks]
    : tasks;
  const [taskId, setTaskId] = useState(entry?.task_id ?? choices[0]?.id ?? "");
  const [day, setDay] = useState(entry?.day ?? localDay());
  const [dur, setDur] = useState(entry ? toHm(entry.duration_s) : "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const secs = parseDuration(dur);
    if (secs == null) return setError(t("badDuration"));
    setBusy(true);
    try {
      const body = { task_id: taskId, day, duration_s: secs, note };
      if (entry) await work("PUT", `entries/${entry.id}`, { body });
      else await work("POST", "entries", { body });
      onSaved();
    } catch (e) {
      setError(errMsg(e, t("offline")));
      setBusy(false);
    }
  }
  async function remove() {
    if (!entry || !window.confirm(t("confirmDelete"))) return;
    try {
      await work("DELETE", `entries/${entry.id}`);
      onSaved();
    } catch (e) {
      setError(errMsg(e, t("offline")));
    }
  }

  return (
    <Dlg icon={<IconClock />} title={entry ? t("editTime") : t("logTime")} onClose={onClose} onSubmit={save} error={error} busy={busy}
      submitLabel={t("save")} extra={entry && <button type="button" className="bibo-btn bibo-btn--ghost" onClick={remove}>{t("delete")}</button>}>
      <label className="bibo-field">
        <span className="bibo-field__lbl">{t("col.task")}</span>
        <span className="bibo-input">
          <select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
            {choices.map((x) => <option key={x.id} value={x.id}>{x.project_name} · {x.title}</option>)}
          </select>
        </span>
      </label>
      <div className="bb-task-row2">
        <label className="bibo-field">
          <span className="bibo-field__lbl">{t("col.day")}</span>
          <span className="bibo-input"><input type="date" value={day} max={localDay()} onChange={(e) => setDay(e.target.value)} /></span>
        </label>
        <label className="bibo-field">
          <span className="bibo-field__lbl">{t("col.duration")}</span>
          <span className="bibo-input"><input type="text" value={dur} onChange={(e) => setDur(e.target.value)} placeholder="1:30" /></span>
        </label>
      </div>
      <label className="bibo-field">
        <span className="bibo-field__lbl">{t("note")}</span>
        <span className="bibo-input"><input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("notePlaceholder")} /></span>
      </label>
    </Dlg>
  );
}
