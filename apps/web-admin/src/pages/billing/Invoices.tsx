import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { billingApi, type Client, type Invoice, type InvoiceDraft } from "../../api/billing";
import { Empty, Notice, Spinner } from "../../components/ui";
import { useBusinesses } from "../../useBusinesses";
import { StatCard } from "../Dashboard";
import {
  Dialog, DialogFoot, IconAlert, IconArrowRight, IconCoins, IconPlus, IconReceipt, IconCheckList, InvoicePill, Row2,
  SelectField, TextArea, TextField, errText, fmtDay, fmtHours, fmtMoney, ic, localDay, startOfMonth,
} from "./common";
import { BillingGate } from "./BillingGate";

export const isOverdue = (i: Invoice) => i.status === "sent" && i.due_date < localDay();

/** Invoices: what's outstanding, overdue and paid, and creating a new one from unbilled time. */
export function Invoices() {
  return <BillingGate>{(biz) => <InvoicesInner biz={biz} />}</BillingGate>;
}

function InvoicesInner({ biz }: { biz: string }) {
  const { t } = useTranslation("billing");
  const navigate = useNavigate();
  const { selected } = useBusinesses();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([billingApi.invoices(biz), billingApi.clients(biz), billingApi.settings(biz)])
      .then(([i, c, s]) => {
        setInvoices(i.invoices);
        setClients(c.clients);
        setCurrency(s.currency);
      })
      .catch((e) => setError(errText(e, t("common.loadError"))))
      .finally(() => setLoading(false));
  }, [biz, t]);
  useEffect(load, [load]);

  const sum = (list: Invoice[]) => list.reduce((s, i) => s + i.total_cents, 0);
  const outstanding = invoices.filter((i) => i.status === "sent");
  const overdue = outstanding.filter(isOverdue);
  const monthStart = startOfMonth();
  const paidMonth = invoices.filter((i) => i.status === "paid" && (i.paid_at ?? "").slice(0, 10) >= monthStart);
  const drafts = invoices.filter((i) => i.status === "draft");

  return (
    <div className="admin-wrap" style={{ paddingBottom: 32 }}>
      <div className="admin-pagehead">
        <div className="admin-pagehead__main">
          <h1 className="admin-h1">{t("invoices.title")}</h1>
          <p className="admin-sub">
            {selected?.name} · {t("invoices.count", { count: invoices.length })}
          </p>
        </div>
        <div className="admin-pagehead__actions">
          <button className="bibo-btn bibo-btn--primary" onClick={() => setCreating(true)} disabled={clients.length === 0}>
            {ic(IconPlus)}
            <span>{t("invoices.new")}</span>
          </button>
        </div>
      </div>

      {error && <Notice kind="danger">{error}</Notice>}
      {!loading && clients.length === 0 && <Notice kind="info">{t("invoices.needClient")}</Notice>}

      <div className="admin-stats">
        <StatCard focal icon={IconCoins} label={t("invoices.statOutstanding")} value={fmtMoney(sum(outstanding), currency)}
          sub={t("invoices.countSub", { count: outstanding.length })} />
        <StatCard icon={IconAlert} label={t("invoices.statOverdue")} value={fmtMoney(sum(overdue), currency)}
          sub={t("invoices.countSub", { count: overdue.length })} />
        <StatCard icon={IconCheckList} label={t("invoices.statPaid")} value={fmtMoney(sum(paidMonth), currency)}
          sub={t("invoices.thisMonth")} />
        <StatCard icon={IconReceipt} label={t("invoices.statDrafts")} value={drafts.length} sub={fmtMoney(sum(drafts), currency)} />
      </div>

      {loading && <Spinner label={t("common.loading")} />}
      {!loading && invoices.length === 0 && clients.length > 0 && <Empty>{t("invoices.empty")}</Empty>}

      {invoices.length > 0 && (
        <div className="bibo-card bibo-card--default admin-tablecard">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("invoices.col.number")}</th>
                <th>{t("invoices.col.client")}</th>
                <th>{t("invoices.col.issued")}</th>
                <th>{t("invoices.col.due")}</th>
                <th className="r">{t("invoices.col.total")}</th>
                <th>{t("invoices.col.status")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td className="num">{i.number}</td>
                  <td>{i.client_name}</td>
                  <td className="admin-relt">{fmtDay(i.issue_date)}</td>
                  <td className="admin-relt">{fmtDay(i.due_date)}</td>
                  <td className="r num">{fmtMoney(i.total_cents, i.currency)}</td>
                  <td><InvoicePill status={i.status} overdue={isOverdue(i)} /></td>
                  <td className="r">
                    <button type="button" className="admin-viewlink" onClick={() => navigate(`/billing/invoices/${i.id}`)}>
                      {t("common.view")}
                      {IconArrowRight}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <NewInvoiceDialog biz={biz} clients={clients.filter((c) => !c.archived)} currency={currency} onClose={() => setCreating(false)}
          onCreated={(id) => navigate(`/billing/invoices/${id}`)} />
      )}
    </div>
  );
}

function NewInvoiceDialog({
  biz, clients, currency, onClose, onCreated,
}: {
  biz: string;
  clients: Client[];
  currency: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation("billing");
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(localDay());
  const [issue, setIssue] = useState(localDay());
  const [due, setDue] = useState(localDay(14));
  const [tax, setTax] = useState("0");
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const taxBP = Math.round((Number(tax.replace(",", ".")) || 0) * 100);
  const taxOk = taxBP >= 0 && taxBP <= 10000;

  useEffect(() => {
    if (!clientId || !from || !to || to < from || !taxOk) return setDraft(null);
    let cancelled = false;
    billingApi
      .previewInvoice(biz, { client_id: clientId, from, to, tax_bp: taxBP })
      .then((d) => !cancelled && setDraft(d))
      .catch(() => !cancelled && setDraft(null));
    return () => {
      cancelled = true;
    };
  }, [biz, clientId, from, to, taxBP, taxOk]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const r = await billingApi.createInvoice(biz, { client_id: clientId, from, to, issue_date: issue, due_date: due, tax_bp: taxBP, notes });
      onCreated(r.id);
    } catch (e) {
      setError(errText(e, t("common.saveError")));
    } finally {
      setBusy(false);
    }
  }

  const empty = draft != null && draft.lines.length === 0;
  return (
    <Dialog icon={IconReceipt} title={t("invoices.new")} width={640} onClose={onClose} onSubmit={create} error={error}
      foot={<DialogFoot onClose={onClose} busy={busy} label={t("invoices.createDraft")} disabled={!draft || empty || !taxOk} />}>
      <SelectField label={t("invoices.col.client")} value={clientId} onChange={setClientId} required>
        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </SelectField>
      <Row2>
        <TextField label={t("invoices.periodFrom")} type="date" value={from} max={to} onChange={setFrom} required />
        <TextField label={t("invoices.periodTo")} type="date" value={to} min={from} onChange={setTo} required />
      </Row2>
      <Row2>
        <TextField label={t("invoices.col.issued")} type="date" value={issue} onChange={setIssue} required />
        <TextField label={t("invoices.col.due")} type="date" value={due} min={issue} onChange={setDue} required />
      </Row2>
      <TextField label={t("invoices.taxPct")} value={tax} onChange={setTax} placeholder="0" hint={taxOk ? undefined : t("invoices.badTax")} />
      <TextArea label={t("invoices.notes")} value={notes} onChange={setNotes} rows={2} placeholder={t("invoices.notesPlaceholder")} />

      {draft && draft.missing_rates.length > 0 && (
        <Notice kind="info">{t("invoices.missingRates", { names: draft.missing_rates.join(", ") })}</Notice>
      )}
      {empty && <Notice kind="info">{t("invoices.nothingToBill")}</Notice>}
      {draft && !empty && (
        <div className="bibo-card bibo-card--default admin-tablecard bill-preview">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("invoices.col.item")}</th>
                <th className="r">{t("invoices.col.hours")}</th>
                <th className="r">{t("invoices.col.amount")}</th>
              </tr>
            </thead>
            <tbody>
              {draft.lines.map((l, i) => (
                <tr key={i}>
                  <td>{l.description}<span className="bill-sub">{fmtMoney(l.rate_cents, currency)}{t("common.perHour")}</span></td>
                  <td className="r num">{fmtHours(l.seconds)}</td>
                  <td className="r num">{fmtMoney(l.amount_cents, currency)}</td>
                </tr>
              ))}
              <tr>
                <td><strong>{t("invoices.total")}</strong>{draft.tax_cents > 0 && <span className="bill-sub">{t("invoices.inclTax", { tax: fmtMoney(draft.tax_cents, currency) })}</span>}</td>
                <td className="r num"><strong>{fmtHours(draft.seconds)}</strong></td>
                <td className="r num"><strong>{fmtMoney(draft.total_cents, currency)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
}
