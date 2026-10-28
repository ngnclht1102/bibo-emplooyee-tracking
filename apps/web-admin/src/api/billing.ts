// Billing API (tickets 152, 159) — owner side: projects, tasks, rates, time, and the
// invoices members raise against the workspace (the owner reads and settles them,
// never creates them). Money is integer cents of the workspace currency.
import { request } from "./client";
import type { ScreenshotMeta } from "./types";

export interface BillingSettings {
  currency: string;
  billing_details: string;
  business_name: string;
}
export interface BillingMember {
  id: string;
  name: string;
  login: string;
  role: "owner" | "employee";
  rate_cents: number | null;
}
export interface MemberRate {
  id: number;
  user_id: string;
  rate_cents: number;
  effective_from: string;
}
export interface Project {
  id: string;
  name: string;
  billable: boolean;
  rate_cents: number | null;
  archived: boolean;
}
export interface Task {
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
}
export interface TimeEntry {
  id: string;
  user_id: string;
  user_name: string;
  task_id: string;
  task_title: string;
  project_id: string;
  project_name: string;
  billable: boolean;
  day: string;
  duration_s: number;
  note: string;
  source: "manual" | "timer";
  started_at: string | null;
  ended_at: string | null;
  invoice_id: string | null;
  invoice_number: string;
}
/** One member's contribution to a task (CTR-16). keystrokes vs keystrokes_day =
 *  the share of their typing on those days that landed on this task. */
export interface TaskStat {
  user_id: string;
  user_name: string;
  seconds: number;
  keystrokes: number;
  keystrokes_day: number;
  shots: number;
}
export type TaskScreenshot = ScreenshotMeta & { user_id: string; user_name: string };
export interface TaskDetail {
  task: Task;
  entries: TimeEntry[];
  stats: TaskStat[];
  screenshots: TaskScreenshot[];
  shot_total: number;
}
export interface TrackedDay {
  user_id: string;
  day: string;
  seconds: number;
}
export type InvoiceStatus = "draft" | "sent" | "paid" | "void";
export interface InvoiceLine {
  description: string;
  user_id: string;
  user_name: string;
  task_id: string;
  seconds: number;
  rate_cents: number;
  amount_cents: number;
}
export interface Invoice {
  id: string;
  user_id: string;
  user_name: string;
  user_login: string;
  /** The member's own "from" block, as they filled it in on the desktop. */
  user_details: string;
  number: string;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  period_from: string;
  period_to: string;
  currency: string;
  subtotal_cents: number;
  tax_bp: number;
  tax_cents: number;
  total_cents: number;
  notes: string;
  sent_at: string | null;
  paid_at: string | null;
  lines?: InvoiceLine[];
}

const base = (biz: string) => `/v1/businesses/${encodeURIComponent(biz)}/billing`;
const enc = encodeURIComponent;

export const billingApi = {
  settings: (biz: string) => request<BillingSettings>(`${base(biz)}/settings`),
  saveSettings: (biz: string, s: { currency: string; billing_details: string }) =>
    request<{ ok: true }>(`${base(biz)}/settings`, { method: "PUT", body: s }),

  members: (biz: string, today: string) =>
    request<{ members: BillingMember[] }>(`${base(biz)}/members`, { query: { today } }),
  rates: (biz: string) => request<{ rates: MemberRate[] }>(`${base(biz)}/rates`),
  setRate: (biz: string, r: { user_id: string; rate_cents: number; effective_from: string }) =>
    request<{ ok: true }>(`${base(biz)}/rates`, { method: "POST", body: r }),
  deleteRate: (biz: string, id: number) => request<{ ok: true }>(`${base(biz)}/rates/${id}`, { method: "DELETE" }),

  projects: (biz: string) => request<{ projects: Project[] }>(`${base(biz)}/projects`),
  saveProject: (biz: string, p: Partial<Project>) =>
    p.id
      ? request<Project>(`${base(biz)}/projects/${enc(p.id)}`, { method: "PUT", body: p })
      : request<Project>(`${base(biz)}/projects`, { method: "POST", body: p }),
  deleteProject: (biz: string, id: string) => request<{ ok: true }>(`${base(biz)}/projects/${enc(id)}`, { method: "DELETE" }),

  tasks: (biz: string) => request<{ tasks: Task[] }>(`${base(biz)}/tasks`),
  saveTask: (biz: string, t: { id?: string; project_id: string; title: string; status: string; assignee_id: string | null }) =>
    t.id
      ? request<Task>(`${base(biz)}/tasks/${enc(t.id)}`, { method: "PUT", body: t })
      : request<Task>(`${base(biz)}/tasks`, { method: "POST", body: t }),
  deleteTask: (biz: string, id: string) => request<{ ok: true }>(`${base(biz)}/tasks/${enc(id)}`, { method: "DELETE" }),
  taskDetail: (biz: string, id: string) =>
    request<TaskDetail>(`${base(biz)}/tasks/${enc(id)}/detail`, { query: { tz: -new Date().getTimezoneOffset() } }),

  entries: (biz: string, q: { from: string; to: string; user_id?: string; project_id?: string }) =>
    request<{ entries: TimeEntry[] }>(`${base(biz)}/entries`, { query: q }),
  saveEntry: (biz: string, e: { id?: string; user_id: string; task_id: string; day: string; duration_s: number; note: string }) =>
    e.id
      ? request<TimeEntry>(`${base(biz)}/entries/${enc(e.id)}`, { method: "PUT", body: e })
      : request<TimeEntry>(`${base(biz)}/entries`, { method: "POST", body: e }),
  deleteEntry: (biz: string, id: string) => request<{ ok: true }>(`${base(biz)}/entries/${enc(id)}`, { method: "DELETE" }),
  tracked: (biz: string, from: string, to: string) =>
    request<{ tracked: TrackedDay[] }>(`${base(biz)}/tracked`, {
      query: { from, to, tz: -new Date().getTimezoneOffset() },
    }),

  invoices: (biz: string) => request<{ invoices: Invoice[] }>(`${base(biz)}/invoices`),
  invoice: (biz: string, id: string) =>
    request<{ invoice: Invoice; to: BillingSettings }>(`${base(biz)}/invoices/${enc(id)}`),
  updateInvoice: (biz: string, id: string, u: { status: InvoiceStatus }) =>
    request<{ ok: true }>(`${base(biz)}/invoices/${enc(id)}`, { method: "PATCH", body: u }),
  deleteInvoice: (biz: string, id: string) => request<{ ok: true }>(`${base(biz)}/invoices/${enc(id)}`, { method: "DELETE" }),
};
