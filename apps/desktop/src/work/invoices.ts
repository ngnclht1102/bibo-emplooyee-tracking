import { work } from "./useTaskTimer";

// Invoices, member side (ticket 159): a member bills the workspace for their own
// logged time — the owner receives it, records payment or voids it, and never raises
// one. Everything goes through the `/v1/work/` prefix the Rust command allows.
// Money is integer cents of the workspace currency.

export type InvoiceStatus = "draft" | "sent" | "paid" | "void";
export type InvoiceLine = {
  description: string;
  user_id: string;
  user_name: string;
  task_id: string;
  seconds: number;
  rate_cents: number;
  amount_cents: number;
};
export type Invoice = {
  id: string;
  user_id: string;
  user_name: string;
  user_login: string;
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
};
/** What an invoice for a period would contain, before it exists. */
export type InvoiceDraft = {
  lines: InvoiceLine[];
  entry_ids: string[];
  seconds: number;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  missing_rates: string[];
};
export type NewInvoice = {
  from: string;
  to: string;
  issue_date: string;
  due_date: string;
  tax_bp: number;
  notes: string;
};
/** The workspace the invoice is billed to. */
export type BillTo = { currency: string; billing_details: string; business_name: string };

export const invoiceApi = {
  list: () => work<{ invoices: Invoice[] }>("GET", "invoices"),
  get: (id: string) => work<{ invoice: Invoice; to: BillTo }>("GET", `invoices/${id}`),
  preview: (n: Pick<NewInvoice, "from" | "to" | "tax_bp">) => work<InvoiceDraft>("POST", "invoices/preview", { body: n }),
  create: (n: NewInvoice) => work<{ id: string }>("POST", "invoices", { body: n }),
  submit: (id: string) => work<{ ok: true }>("PATCH", `invoices/${id}`, { body: { status: "sent" } }),
  remove: (id: string) => work<{ ok: true }>("DELETE", `invoices/${id}`),
  saveMyDetails: (details: string) => work<{ ok: true }>("PUT", "billing-details", { body: { billing_details: details } }),
};

export function fmtMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** 5400 → "1:30". */
export const fmtHours = (seconds: number) =>
  `${Math.floor(seconds / 3600)}:${String(Math.round((seconds % 3600) / 60)).padStart(2, "0")}`;

/** Today, or n days from now, as a local YYYY-MM-DD. */
export function day(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
