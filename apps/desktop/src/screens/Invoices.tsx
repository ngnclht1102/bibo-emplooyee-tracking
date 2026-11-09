import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { StatCard } from "../ui";
import {
  day, fmtHours, fmtMoney, invoiceApi, monthStart,
  type BillTo, type Invoice, type InvoiceDraft, type InvoiceStatus,
} from "../work/invoices";
import { errMsg, type TaskTimer } from "../work/useTaskTimer";
import { Dlg, Field, IconClock, IconBack, IconPlus, IconUser } from "../work/ui";

// Billing, member side (ticket 159): a member invoices the workspace for their own
// logged time. The rate is the owner's to set — here it is read-only — and only
// billable, not-yet-invoiced time can go on an invoice. Draft → sent is this
// screen's job; recording payment and voiding stay with the owner on the web.

const IconReceipt = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3z" /><path d="M9 8h6M9 12h6" />
  </svg>
);
const IconCoins = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="9" cy="9" r="6" /><path d="M14.5 4.2a6 6 0 0 1 0 15.6M9 6v6l3.5 2" />
  </svg>
);

const parsePct = (s: string): number | null => {
  const v = Number(s.trim().replace(",", "."));
  if (s.trim() === "") return 0;
  return Number.isFinite(v) && v >= 0 && v <= 100 ? Math.round(v * 100) : null;
};

function StatusPill({ status, overdue }: { status: InvoiceStatus; overdue: boolean }) {
  const { t } = useTranslation("tasks");
  if (overdue) return <span className="pill pill-danger">{t("invoice.status.overdue")}</span>;
  const cls = status === "paid" ? "pill pill-success" : "pill";
  return <span className={cls}>{t(`invoice.status.${status}`)}</span>;
}

const isOverdue = (i: Invoice) => i.status === "sent" && i.due_date < day();

export function Invoices({ tt }: { tt: TaskTimer }) {
  const { t } = useTranslation("tasks");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"new" | "details" | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    invoiceApi
      .list()
      .then((r) => {
        setInvoices(r.invoices);
        setError(null);
      })
      .catch((e) => setError(errMsg(e, "")))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const bill = tt.ctx?.billing;
  const errText = error === null ? null : error || t("offline");
  const currency = bill?.currency ?? "USD";

  if (open) {
    return <InvoiceView id={open} onBack={() => { setOpen(null); load(); }} />;
  }

  const sum = (list: Invoice[]) => list.reduce((s, i) => s + i.total_cents, 0);
  const waiting = invoices.filter((i) => i.status === "sent");
  const paidMonth = invoices.filter((i) => i.status === "paid" && (i.paid_at ?? "").slice(0, 10) >= monthStart());
  const drafts = invoices.filter((i) => i.status === "draft");

  return (
    <div className="bb-members">
      <div className="bb-members__head">
        <div>
          <h1 className="bb-adminboard__title">{t("invoice.title")}</h1>
          <p className="bb-adminboard__who">{bill?.business_name}</p>
        </div>
        <div className="bb-members__actions">
          <button type="button" className="bibo-btn bibo-btn--secondary bb-members__add" onClick={() => setDialog("details")}>
            <IconUser /> {t("invoice.myDetails")}
          </button>
          <button type="button" className="bibo-btn bibo-btn--primary bb-members__add" onClick={() => setDialog("new")}>
            <IconPlus /> {t("invoice.new")}
          </button>
        </div>
      </div>

      {errText && <div className="auth-err" role="alert">{errText}</div>}
      {bill && bill.rate_cents == null && <div className="bb-task-notice" role="status">{t("invoice.noRate")}</div>}

      <div className="bb-adminboard__stats">
        <StatCard focal icon={<IconCoins />} label={t("invoice.statRate")}
          value={bill?.rate_cents != null ? fmtMoney(bill.rate_cents, currency) : "—"} sub={t("invoice.perHour")} />
        <StatCard icon={<IconReceipt />} label={t("invoice.statWaiting")} value={fmtMoney(sum(waiting), currency)}
          sub={t("invoice.countSub", { count: waiting.length })} />
        <StatCard icon={<IconClock />} label={t("invoice.statPaid")} value={fmtMoney(sum(paidMonth), currency)}
          sub={t("invoice.thisMonth")} />
        <StatCard icon={<IconReceipt />} label={t("invoice.statDrafts")} value={String(drafts.length)}
          sub={fmtMoney(sum(drafts), currency)} />
      </div>

      <div className="card bb-adminboard__tablecard">
        <div className="bb-panel__head bb-task-head">
          <div className="bb-panel__title">{t("invoice.mine")}</div>
        </div>
        {loading ? (
          <div className="muted bb-adminboard__msg">{t("loading")}</div>
        ) : invoices.length === 0 ? (
          <div className="muted bb-adminboard__msg">{t("invoice.empty")}</div>
        ) : (
          <table className="bb-adminboard__table">
            <thead>
              <tr>
                <th>{t("invoice.col.number")}</th>
                <th>{t("invoice.col.period")}</th>
                <th>{t("invoice.col.due")}</th>
                <th className="r">{t("invoice.col.total")}</th>
                <th>{t("invoice.col.status")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td className="num">{i.number}</td>
                  <td className="num">{i.period_from} → {i.period_to}</td>
                  <td className="num">{i.due_date}</td>
                  <td className="r num">{fmtMoney(i.total_cents, i.currency)}</td>
                  <td><StatusPill status={i.status} overdue={isOverdue(i)} /></td>
                  <td className="r">
                    <button type="button" className="bb-adminboard__view" onClick={() => setOpen(i.id)}>{t("invoice.view")}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {dialog === "new" && (
        <NewInvoiceDialog currency={currency} onClose={() => setDialog(null)}
          onCreated={(id) => { setDialog(null); load(); setOpen(id); }} />
      )}
      {dialog === "details" && bill && (
        <MyDetailsDialog details={bill.my_details} onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); tt.reload(); }} />
      )}
    </div>
  );
}

/** One invoice as the owner will see it, with the member's own actions: submit a
 *  draft, or drop it (which releases its time to be billed again). */
function InvoiceView({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useTranslation("tasks");
  const [inv, setInv] = useState<Invoice | null>(null);
  const [to, setTo] = useState<BillTo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    invoiceApi
      .get(id)
      .then((r) => {
        setInv(r.invoice);
        setTo(r.to);
        setError(null);
      })
      .catch((e) => setError(errMsg(e, "")));
  }, [id]);
  useEffect(load, [load]);

  async function submit() {
    if (!window.confirm(t("invoice.confirmSubmit"))) return;
    setBusy(true);
    try {
      await invoiceApi.submit(id);
      load();
    } catch (e) {
      setError(errMsg(e, ""));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!window.confirm(t("invoice.confirmDelete"))) return;
    try {
      await invoiceApi.remove(id);
      onBack();
    } catch (e) {
      setError(errMsg(e, ""));
    }
  }

  const errText = error === null ? null : error || t("offline");
  const money = (c: number) => fmtMoney(c, inv?.currency ?? "USD");

  return (
    <div className="bb-members">
      <div className="bb-members__head">
        <div>
          <button type="button" className="bb-adminboard__view" onClick={onBack}><IconBack /> {t("invoice.back")}</button>
          <h1 className="bb-adminboard__title">{inv?.number ?? "—"}</h1>
          {inv && (
            <p className="bb-adminboard__who">
              {inv.period_from} → {inv.period_to} · <StatusPill status={inv.status} overdue={isOverdue(inv)} />
            </p>
          )}
        </div>
        {inv?.status === "draft" && (
          <div className="bb-members__actions">
            <button type="button" className="bibo-btn bibo-btn--ghost bb-members__add" onClick={remove}>{t("delete")}</button>
            <button type="button" className="bibo-btn bibo-btn--primary bb-members__add" disabled={busy} onClick={submit}>
              {t("invoice.submit")}
            </button>
          </div>
        )}
      </div>

      {errText && <div className="auth-err" role="alert">{errText}</div>}
      {inv?.status === "draft" && <div className="bb-task-notice" role="status">{t("invoice.draftNote")}</div>}
      {inv?.status === "void" && <div className="bb-task-notice" role="status">{t("invoice.voidNote")}</div>}

      {inv && to && (
        <div className="card bb-invoice">
          <div className="bb-invoice__head">
            <div>
              <div className="muted bb-task-sub">{t("invoice.doc.from")}</div>
              <div className="bb-invoice__block">{[inv.user_name, inv.user_login, inv.user_details].filter(Boolean).join("\n")}</div>
            </div>
            <div>
              <div className="muted bb-task-sub">{t("invoice.doc.billTo")}</div>
              <div className="bb-invoice__block">{[to.business_name, to.billing_details].filter(Boolean).join("\n")}</div>
            </div>
            <div>
              <div className="muted bb-task-sub">{t("invoice.col.issued")}</div>
              <div className="bb-invoice__block num">{inv.issue_date}</div>
              <div className="muted bb-task-sub">{t("invoice.col.due")}</div>
              <div className="bb-invoice__block num">{inv.due_date}</div>
            </div>
          </div>

          <table className="bb-adminboard__table">
            <thead>
              <tr>
                <th>{t("invoice.col.item")}</th>
                <th className="r">{t("invoice.col.hours")}</th>
                <th className="r">{t("invoice.col.rate")}</th>
                <th className="r">{t("invoice.col.amount")}</th>
              </tr>
            </thead>
            <tbody>
              {(inv.lines ?? []).map((l, n) => (
                <tr key={n}>
                  <td>{l.description}</td>
                  <td className="r num">{fmtHours(l.seconds)}</td>
                  <td className="r num">{money(l.rate_cents)}</td>
                  <td className="r num">{money(l.amount_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="bb-invoice__totals">
            <div><span>{t("invoice.subtotal")}</span><span className="num">{money(inv.subtotal_cents)}</span></div>
            {inv.tax_bp > 0 && (
              <div><span>{t("invoice.tax", { pct: inv.tax_bp / 100 })}</span><span className="num">{money(inv.tax_cents)}</span></div>
            )}
            <div className="bb-invoice__grand"><span>{t("invoice.totalDue")}</span><span className="num">{money(inv.total_cents)}</span></div>
          </div>
          {inv.notes && <div className="muted bb-invoice__notes">{inv.notes}</div>}
        </div>
      )}
    </div>
  );
}

/** Pick a period, see what it comes to, create the draft. */
function NewInvoiceDialog({ currency, onClose, onCreated }: {
  currency: string; onClose: () => void; onCreated: (id: string) => void;
}) {
  const { t } = useTranslation("tasks");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(day());
  const [issue, setIssue] = useState(day());
  const [due, setDue] = useState(day(14));
  const [tax, setTax] = useState("0");
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const taxBP = parsePct(tax);

  useEffect(() => {
    if (!from || !to || to < from || taxBP == null) return setDraft(null);
    let alive = true;
    invoiceApi
      .preview({ from, to, tax_bp: taxBP })
      .then((d) => alive && setDraft(d))
      .catch(() => alive && setDraft(null));
    return () => {
      alive = false;
    };
  }, [from, to, taxBP]);

  async function save() {
    if (taxBP == null) return setError(t("invoice.badTax"));
    setBusy(true);
    try {
      const r = await invoiceApi.create({ from, to, issue_date: issue, due_date: due, tax_bp: taxBP, notes });
      onCreated(r.id);
    } catch (e) {
      setError(errMsg(e, t("offline")));
      setBusy(false);
    }
  }

  const nothing = draft != null && draft.lines.length === 0;
  return (
    <Dlg icon={<IconReceipt />} title={t("invoice.new")} onClose={onClose} onSubmit={save} error={error} busy={busy}
      submitLabel={t("invoice.createDraft")}>
      <div className="bb-task-row2">
        <Field label={t("invoice.periodFrom")}>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label={t("invoice.periodTo")}>
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      <div className="bb-task-row2">
        <Field label={t("invoice.col.issued")}>
          <input type="date" value={issue} onChange={(e) => setIssue(e.target.value)} />
        </Field>
        <Field label={t("invoice.col.due")}>
          <input type="date" value={due} min={issue} onChange={(e) => setDue(e.target.value)} />
        </Field>
      </div>
      <Field label={t("invoice.taxPct")}>
        <input type="text" value={tax} onChange={(e) => setTax(e.target.value)} placeholder="0" />
      </Field>
      <Field label={t("invoice.notes")}>
        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("invoice.notesPlaceholder")} />
      </Field>

      {draft && draft.missing_rates.length > 0 && <div className="bb-task-notice">{t("invoice.noRate")}</div>}
      {nothing && <div className="bb-task-notice">{t("invoice.nothingToBill")}</div>}
      {draft && !nothing && (
        <table className="bb-adminboard__table bb-invoice__preview">
          <thead>
            <tr>
              <th>{t("invoice.col.item")}</th>
              <th className="r">{t("invoice.col.hours")}</th>
              <th className="r">{t("invoice.col.amount")}</th>
            </tr>
          </thead>
          <tbody>
            {draft.lines.map((l, n) => (
              <tr key={n}>
                <td>{l.description}<div className="muted bb-task-sub">{fmtMoney(l.rate_cents, currency)}{t("invoice.perHourShort")}</div></td>
                <td className="r num">{fmtHours(l.seconds)}</td>
                <td className="r num">{fmtMoney(l.amount_cents, currency)}</td>
              </tr>
            ))}
            <tr>
              <td><strong>{t("invoice.totalDue")}</strong></td>
              <td className="r num"><strong>{fmtHours(draft.seconds)}</strong></td>
              <td className="r num"><strong>{fmtMoney(draft.total_cents, currency)}</strong></td>
            </tr>
          </tbody>
        </table>
      )}
    </Dlg>
  );
}

/** The member's own "from" block, printed on every invoice they raise. */
function MyDetailsDialog({ details, onClose, onSaved }: { details: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation("tasks");
  const [text, setText] = useState(details);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    try {
      await invoiceApi.saveMyDetails(text);
      onSaved();
    } catch (e) {
      setError(errMsg(e, t("offline")));
      setBusy(false);
    }
  }

  return (
    <Dlg icon={<IconUser />} title={t("invoice.myDetails")} onClose={onClose} onSubmit={save} error={error} busy={busy}
      submitLabel={t("save")}>
      <Field label={t("invoice.myDetailsLabel")}>
        <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("invoice.myDetailsPlaceholder")} />
      </Field>
    </Dlg>
  );
}
