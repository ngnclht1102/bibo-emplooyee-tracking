import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { call as invoke } from "../api";

// Billing (ticket 152): the member side. Pick a task and run a timer (only active
// time is logged — idle and paused time are left out, using this machine's own
// tracking), or log time by hand; create tasks in the team's projects. Money is
// never shown here; the owner manages rates and invoices on the web.

type Project = { id: string; name: string; client_name: string };
type Task = {
  id: string;
  project_id: string;
  project_name: string;
  client_name: string;
  title: string;
  status: "open" | "done";
  assignee_id: string | null;
  assignee_name: string;
  created_by: string | null;
  logged_s: number;
};
type Entry = {
  id: string;
  task_id: string;
  task_title: string;
  project_name: string;
  day: string;
  duration_s: number;
  note: string;
  source: "manual" | "timer";
  invoice_id: string | null;
};
type Context = { business_id: string; role: string; user_id: string; projects: Project[]; tasks: Task[] };
type Timer = { taskId: string; title: string; project: string; startedAt: number };
type Pending = { task_id: string; day: string; duration_s: number; source: "timer"; started_at: string; client_uuid: string; note: string };

const work = <T,>(method: string, path: string, opts: { query?: Record<string, string>; body?: unknown } = {}) =>
  invoke<T>("work_request", { method, path: `/v1/work/${path}`, query: opts.query ?? null, body: opts.body ?? null });

/** "backend returned 409 Conflict: {"error":"…"}" → "…". */
function errMsg(e: unknown, fallback: string): string {
  const s = String(e ?? "");
  const m = s.match(/\{.*\}$/);
  if (m) {
    try {
      const j = JSON.parse(m[0]);
      if (typeof j.error === "string") return j.error;
    } catch {
      /* not JSON */
    }
  }
  return s.startsWith("network error") ? fallback : s || fallback;
}

const pad = (n: number) => String(n).padStart(2, "0");
const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
function weekStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDay(d);
}

const svgp = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const IconPlus = () => (<svg {...svgp} width="16" height="16" aria-hidden><path d="M5 12h14" /><path d="M12 5v14" /></svg>);
const IconPlay = () => (<svg {...svgp} width="16" height="16" aria-hidden><path d="M6 3l14 9-14 9V3z" /></svg>);
const IconStop = () => (<svg {...svgp} width="16" height="16" aria-hidden><rect x="5" y="5" width="14" height="14" rx="2" /></svg>);
const IconX = () => (<svg {...svgp} width="18" height="18" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>);
const IconClock = () => (<svg {...svgp} width="20" height="20" aria-hidden><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>);
const IconList = () => (<svg {...svgp} width="20" height="20" aria-hidden><path d="m3 17 2 2 4-4" /><path d="m3 7 2 2 4-4" /><path d="M13 6h8" /><path d="M13 12h8" /><path d="M13 18h8" /></svg>);

export function Tasks({ user }: { user: string }) {
  const { t } = useTranslation("tasks");
  const timerKey = `bibo.timer:${user}`;
  const queueKey = `bibo.timerQueue:${user}`;
  const [ctx, setCtx] = useState<Context | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showTeam, setShowTeam] = useState(false);
  const [timer, setTimer] = useState<Timer | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(timerKey) || "null");
    } catch {
      return null;
    }
  });
  const [now, setNow] = useState(Date.now());
  const [pick, setPick] = useState("");
  const [dialog, setDialog] = useState<"task" | "time" | Entry | null>(null);
  const flushing = useRef(false);

  const load = useCallback(async () => {
    try {
      const c = await work<Context>("GET", "context");
      setCtx(c);
      const e = await work<{ entries: Entry[] }>("GET", "entries", { query: { from: weekStart(), to: localDay() } });
      setEntries(e.entries);
      setError(null);
    } catch (e) {
      setError(errMsg(e, t("offline")));
    }
  }, [t]);

  // Timer uploads that failed (offline) wait here and are retried; the client_uuid
  // makes a retry safe even if the first attempt actually reached the server.
  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      let q: Pending[] = JSON.parse(localStorage.getItem(queueKey) || "[]");
      while (q.length) {
        await work("POST", "entries", { body: q[0] });
        q = q.slice(1);
        localStorage.setItem(queueKey, JSON.stringify(q));
      }
    } catch {
      /* still offline — next focus/refresh retries */
    } finally {
      flushing.current = false;
    }
  }, [queueKey]);

  useEffect(() => {
    flush().then(load);
    const onFocus = () => flush().then(load);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [flush, load]);

  useEffect(() => {
    if (!timer) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timer]);

  function saveTimer(tm: Timer | null) {
    setTimer(tm);
    if (tm) localStorage.setItem(timerKey, JSON.stringify(tm));
    else localStorage.removeItem(timerKey);
  }

  function start(task: Task) {
    if (timer) return;
    saveTimer({ taskId: task.id, title: task.title, project: task.project_name, startedAt: Date.now() });
    setNotice(null);
  }

  async function stop() {
    if (!timer) return;
    const end = Date.now();
    // Active seconds this machine tracked while the timer ran (idle/paused excluded).
    let active = 0;
    try {
      const d = await invoke<{ total_active_s: number }>("dashboard_data", {
        fromTs: Math.floor(timer.startedAt / 1000),
        toTs: Math.ceil(end / 1000),
      });
      active = Math.min(d.total_active_s, Math.round((end - timer.startedAt) / 1000), 86400);
    } catch {
      active = 0;
    }
    const tm = timer;
    saveTimer(null);
    if (active < 60) {
      setNotice(t("timer.tooShort"));
      return;
    }
    const entry: Pending = {
      task_id: tm.taskId,
      day: localDay(new Date(tm.startedAt)),
      duration_s: active,
      source: "timer",
      started_at: new Date(tm.startedAt).toISOString(),
      client_uuid: crypto.randomUUID(),
      note: "",
    };
    const q: Pending[] = JSON.parse(localStorage.getItem(queueKey) || "[]");
    localStorage.setItem(queueKey, JSON.stringify([...q, entry]));
    setNotice(t("timer.logged", { d: fmtDur(active), task: tm.title }));
    await flush();
    load();
  }

  async function setStatus(task: Task, status: "open" | "done") {
    try {
      await work("PUT", `tasks/${task.id}`, { body: { project_id: task.project_id, title: task.title, status } });
      load();
    } catch (e) {
      setError(errMsg(e, t("offline")));
    }
  }

  if (error && !ctx) {
    return <div className="card bb-adminboard__tablecard"><div className="muted bb-adminboard__msg">{error}</div></div>;
  }
  if (!ctx) return <div className="muted bb-adminboard__msg">{t("loading")}</div>;

  const me = ctx.user_id;
  const mine = ctx.tasks.filter((x) => x.status === "open" && (x.assignee_id === me || (!x.assignee_id && x.created_by === me)));
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

      {error && <div className="auth-err" role="alert">{error}</div>}
      {notice && <div className="bb-task-notice" role="status">{notice}</div>}
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
                  <td>
                    {x.project_name}
                    {x.client_name && <div className="muted bb-task-sub">{x.client_name}</div>}
                  </td>
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
        <TaskDialog projects={ctx.projects} onClose={() => setDialog(null)} onSaved={(task) => { setDialog(null); load(); setPick(task.id); }} />
      )}
      {(dialog === "time" || (dialog && typeof dialog === "object")) && (
        <TimeDialog tasks={openTasks} entry={typeof dialog === "object" ? dialog : null}
          onClose={() => setDialog(null)} onSaved={() => { setDialog(null); load(); }} />
      )}
    </div>
  );
}

function Dlg({ icon, title, onClose, onSubmit, error, busy, submitLabel, extra, children }: {
  icon: ReactNode; title: string; onClose: () => void; onSubmit: () => void; error: string | null;
  busy: boolean; submitLabel: string; extra?: ReactNode; children: ReactNode;
}) {
  const { t } = useTranslation("tasks");
  return (
    <div className="bb-modal-overlay" onClick={() => !busy && onClose()}>
      <div className="bibo-dlg" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); onSubmit(); }}>
          <div className="bibo-dlg__head">
            <div className="bibo-dlg__icon">{icon}</div>
            <div className="bibo-dlg__title">{title}</div>
            <button type="button" className="bibo-dlg__close" aria-label={t("cancel")} onClick={onClose}><IconX /></button>
          </div>
          <div className="bibo-dlg__body">
            {error && <div className="auth-err" role="alert">{error}</div>}
            {children}
          </div>
          <div className="bibo-dlg__foot">
            {extra}
            <button type="button" className="bibo-btn bibo-btn--ghost" onClick={onClose} disabled={busy}>{t("cancel")}</button>
            <button type="submit" className="bibo-btn bibo-btn--primary" disabled={busy}>{busy ? t("saving") : submitLabel}</button>
          </div>
        </form>
      </div>
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
            {projects.map((p) => <option key={p.id} value={p.id}>{p.client_name ? `${p.client_name} · ${p.name}` : p.name}</option>)}
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
