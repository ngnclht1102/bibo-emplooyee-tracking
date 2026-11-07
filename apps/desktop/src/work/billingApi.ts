import { call as invoke } from "../api";
import type { ScreenshotMetaRow } from "../screens/admin/reportTypes";

// Billing, owner side (CTR-16): the native Projects / Tasks admin screens call the
// same endpoints web-admin does, through the Rust `billing_request` command (it only
// allows `/v1/businesses/{id}/billing/…`, and the backend re-checks ownership).
// Money is integer cents of the workspace currency.

export type OwnerProject = {
  id: string;
  name: string;
  billable: boolean;
  rate_cents: number | null;
  archived: boolean;
  /** Ticket 163: false = open to the whole workspace, true = only member_ids (+ owners). */
  restricted: boolean;
  member_ids: string[];
};
export type OwnerTask = {
  id: string;
  project_id: string;
  project_name: string;
  title: string;
  status: "open" | "done";
  assignee_id: string | null;
  assignee_name: string;
  created_by: string | null;
  logged_s: number;
  created_at: string;
};
export type Member = {
  id: string;
  name: string;
  login: string;
  role: "owner" | "employee";
  rate_cents: number | null;
};
export type OwnerEntry = {
  id: string;
  user_id: string;
  user_name: string;
  task_id: string;
  day: string;
  duration_s: number;
  note: string;
  source: "manual" | "timer";
  started_at: string | null;
  ended_at: string | null;
  invoice_id: string | null;
  invoice_number: string;
};
/** Per-member contribution to a task; keystrokes vs keystrokes_day = typing share. */
export type TaskStat = {
  user_id: string;
  user_name: string;
  seconds: number;
  keystrokes: number;
  keystrokes_day: number;
  shots: number;
};
export type TaskScreenshot = ScreenshotMetaRow & { user_id: string; user_name: string };
export type TaskDetail = {
  task: OwnerTask;
  entries: OwnerEntry[];
  stats: TaskStat[];
  screenshots: TaskScreenshot[];
  shot_total: number;
};

const billing = <T,>(
  biz: string,
  method: string,
  path: string,
  opts: { query?: Record<string, string>; body?: unknown } = {},
) => invoke<T>("billing_request", { businessId: biz, method, path, query: opts.query ?? null, body: opts.body ?? null });

/** Minutes east of UTC, as the backend wants it for local-day mapping. */
const tz = () => String(-new Date().getTimezoneOffset());

export const billingApi = {
  settings: (biz: string) =>
    billing<{ currency: string; billing_details: string; business_name: string }>(biz, "GET", "settings"),
  members: (biz: string, today: string) => billing<{ members: Member[] }>(biz, "GET", "members", { query: { today } }),

  projects: (biz: string) => billing<{ projects: OwnerProject[] }>(biz, "GET", "projects"),
  saveProject: (biz: string, p: Partial<OwnerProject>) =>
    p.id
      ? billing<OwnerProject>(biz, "PUT", `projects/${p.id}`, { body: p })
      : billing<OwnerProject>(biz, "POST", "projects", { body: p }),

  tasks: (biz: string) => billing<{ tasks: OwnerTask[] }>(biz, "GET", "tasks"),
  saveTask: (
    biz: string,
    t: { id?: string; project_id: string; title: string; status: string; assignee_id: string | null },
  ) => (t.id ? billing<OwnerTask>(biz, "PUT", `tasks/${t.id}`, { body: t }) : billing<OwnerTask>(biz, "POST", "tasks", { body: t })),
  deleteTask: (biz: string, id: string) => billing<{ ok: true }>(biz, "DELETE", `tasks/${id}`),
  taskDetail: (biz: string, id: string) => billing<TaskDetail>(biz, "GET", `tasks/${id}/detail`, { query: { tz: tz() } }),
};
