import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { call as invoke } from "../api";

// Billing (ticket 152 / CTR-16): the member's task timer. It lives here, above the
// Tasks screen, because the menu bar drives it too — a task can be started and
// stopped from the tray while the window is closed or on another screen. Only
// active time is logged (idle and paused time come out of this machine's own
// tracking); money is never part of this.

export type Project = { id: string; name: string };
export type Task = {
  id: string;
  project_id: string;
  project_name: string;
  title: string;
  status: "open" | "done";
  assignee_id: string | null;
  assignee_name: string;
  created_by: string | null;
  logged_s: number;
};
export type Entry = {
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
/** The caller's own money view (ticket 159) — their rate, the workspace currency and
 *  both blocks printed on an invoice they raise. */
export type MyBilling = {
  currency: string;
  rate_cents: number | null;
  my_name: string;
  my_details: string;
  business_name: string;
  business_details: string;
};
export type WorkContext = {
  business_id: string;
  role: string;
  user_id: string;
  projects: Project[];
  tasks: Task[];
  billing: MyBilling;
};
export type Timer = { taskId: string; title: string; project: string; startedAt: number };
type Pending = {
  task_id: string;
  day: string;
  duration_s: number;
  source: "timer";
  started_at: string;
  ended_at: string;
  client_uuid: string;
  note: string;
};

// Which workspace the `/v1/work/*` calls act on. Members have exactly one and leave
// it unset; an owner can have several, and the backend then refuses to guess — so the
// workspace picked in the Admin section is sent along.
let workspaceId: string | null = null;

/** Call a `/v1/work/*` endpoint through the Rust command that gates the prefix. */
export const work = <T,>(method: string, path: string, opts: { query?: Record<string, string>; body?: unknown } = {}) =>
  invoke<T>("work_request", {
    method,
    path: `/v1/work/${path}`,
    query: { ...(workspaceId ? { business_id: workspaceId } : {}), ...(opts.query ?? {}) },
    body: opts.body ?? null,
  });

/** "backend returned 409 Conflict: {"error":"…"}" → "…". */
export function errMsg(e: unknown, fallback: string): string {
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
export const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function weekStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDay(d);
}

/** Open tasks this member is meant to work on (assigned to them, or theirs and unassigned). */
export const myTasks = (ctx: WorkContext) =>
  ctx.tasks.filter(
    (x) => x.status === "open" && (x.assignee_id === ctx.user_id || (!x.assignee_id && x.created_by === ctx.user_id)),
  );

export type TaskTimer = ReturnType<typeof useTaskTimer>;

export function useTaskTimer(user: string, enabled: boolean, businessId: string | null) {
  workspaceId = businessId;
  const timerKey = `bibo.timer:${user}`;
  const queueKey = `bibo.timerQueue:${user}`;
  const [ctx, setCtx] = useState<WorkContext | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState<string | null>(null);
  // What stop() wants to tell the user, as an i18n key + values — the Tasks screen
  // phrases it (the timer can be stopped from the tray, with no screen mounted).
  const [notice, setNotice] = useState<{ key: string; seconds?: number; task?: string } | null>(null);
  const [timer, setTimer] = useState<Timer | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(timerKey) || "null");
    } catch {
      return null;
    }
  });
  const flushing = useRef(false);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const c = await work<WorkContext>("GET", "context");
      setCtx(c);
      const e = await work<{ entries: Entry[] }>("GET", "entries", { query: { from: weekStart(), to: localDay() } });
      setEntries(e.entries);
      setError(null);
    } catch (e) {
      // "" = no message of its own; the screen says "offline" in the user's language.
      setError(errMsg(e, ""));
    }
    // businessId is a dependency so switching workspace refetches.
  }, [enabled, businessId]);

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
    if (!enabled) return;
    flush().then(load);
    const onFocus = () => flush().then(load);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [enabled, flush, load]);

  const saveTimer = useCallback(
    (tm: Timer | null) => {
      setTimer(tm);
      if (tm) localStorage.setItem(timerKey, JSON.stringify(tm));
      else localStorage.removeItem(timerKey);
    },
    [timerKey],
  );

  const start = useCallback(
    (task: Task) => {
      setNotice(null);
      saveTimer({ taskId: task.id, title: task.title, project: task.project_name, startedAt: Date.now() });
    },
    [saveTimer],
  );

  const stop = useCallback(async () => {
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
      setNotice({ key: "timer.tooShort" });
      return;
    }
    const entry: Pending = {
      task_id: tm.taskId,
      day: localDay(new Date(tm.startedAt)),
      duration_s: active,
      source: "timer",
      started_at: new Date(tm.startedAt).toISOString(),
      // The wall-clock window, so the owner's task detail can show the screenshots
      // and typing that happened while this timer ran.
      ended_at: new Date(end).toISOString(),
      client_uuid: crypto.randomUUID(),
      note: "",
    };
    const q: Pending[] = JSON.parse(localStorage.getItem(queueKey) || "[]");
    localStorage.setItem(queueKey, JSON.stringify([...q, entry]));
    setNotice({ key: "timer.logged", seconds: active, task: tm.title });
    await flush();
    load();
  }, [timer, saveTimer, queueKey, flush, load]);

  const setStatus = useCallback(
    async (task: Task, status: "open" | "done") => {
      try {
        await work("PUT", `tasks/${task.id}`, { body: { project_id: task.project_id, title: task.title, status } });
        load();
      } catch (e) {
        // "" = no message of its own; the screen says "offline" in the user's language.
      setError(errMsg(e, ""));
      }
    },
    [load],
  );

  // Keep the menu bar in sync: the member's open tasks for the quick-pick submenu,
  // plus the running timer (the tray shows its elapsed time next to the icon).
  useEffect(() => {
    const tasks = enabled && ctx ? myTasks(ctx).map((x) => ({ id: x.id, title: x.title, project: x.project_name })) : [];
    invoke("set_tray_tasks", {
      tasks,
      timer:
        enabled && timer
          ? { task_id: timer.taskId, title: timer.title, started_at: Math.round(timer.startedAt / 1000) }
          : null,
    }).catch(() => {});
  }, [enabled, ctx, timer]);

  // Tray menu clicks. Read through a ref so the (mount-once) listener always sees
  // the current timer and task list.
  const latest = useRef({ ctx, timer, start, stop });
  latest.current = { ctx, timer, start, stop };
  useEffect(() => {
    const un = listen<{ action: string; task_id?: string }>("tray-task", (e) => {
      const cur = latest.current;
      if (e.payload.action === "stop") {
        cur.stop();
      } else if (e.payload.action === "start" && e.payload.task_id && !cur.timer) {
        const task = cur.ctx?.tasks.find((x) => x.id === e.payload.task_id);
        if (task) cur.start(task);
      }
    });
    return () => {
      un.then((f) => f()).catch(() => {});
    };
  }, []);

  return { ctx, entries, timer, error, notice, setError, setNotice, start, stop, setStatus, reload: load };
}
