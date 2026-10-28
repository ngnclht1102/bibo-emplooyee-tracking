import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { billingApi, type BillingSettings, type Invoice, type InvoiceStatus } from "../../api/billing";
import { Notice, Spinner } from "../../components/ui";
import { IconChevron, IconPrinter, InvoicePill, errText, fmtDay, fmtHours, fmtMoney, ic } from "./common";
import { BillingGate } from "./BillingGate";
import { isOverdue } from "./Invoices";

/** One invoice a member raised against this workspace (ticket 159), with the owner's
 *  actions: record payment, take a payment back, void, or clear a draft that is
 *  holding time. Editing it is the member's job, in the app. "Print / PDF" uses the
 *  browser's print dialog; the print stylesheet keeps only the document. */
export function InvoiceDetail() {
  return <BillingGate>{(biz) => <InvoiceDetailInner biz={biz} />}</BillingGate>;
}

function InvoiceDetailInner({ biz }: { biz: string }) {
  const { t } = useTranslation("billing");
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [to, setTo] = useState<BillingSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    billingApi
      .invoice(biz, id)
      .then((r) => {
        setInv(r.invoice);
        setTo(r.to);
      })
      .catch((e) => setError(errText(e, t("common.loadError"))));
  }, [biz, id, t]);
  useEffect(load, [load]);

  async function setStatus(status: InvoiceStatus, confirmKey?: string) {
    if (confirmKey && !window.confirm(t(confirmKey))) return;
    setBusy(true);
    setError(null);
    try {
      await billingApi.updateInvoice(biz, id, { status });
      load();
    } catch (e) {
      setError(errText(e, t("common.saveError")));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!window.confirm(t("invoices.confirmDelete"))) return;
    try {
      await billingApi.deleteInvoice(biz, id);
      navigate("/billing/invoices");
    } catch (e) {
      setError(errText(e, t("common.saveError")));
    }
  }

  if (!inv || !to) {
    return <div className="admin-wrap">{error ? <Notice kind="danger">{error}</Notice> : <Spinner label={t("common.loading")} />}</div>;
  }

  const money = (c: number) => fmtMoney(c, inv.currency);
  return (
    <div className="admin-wrap" style={{ paddingBottom: 32 }}>
      <div className="admin-crumb">
        <Link to="/billing/invoices">{t("invoices.title")}</Link>
        {ic(IconChevron)}
        <span className="admin-crumb__here">{inv.number}</span>
      </div>
      <div className="admin-pagehead">
        <div className="admin-pagehead__main">
          <h1 className="admin-h1">{inv.number}</h1>
          <p className="admin-sub">
            {t("invoices.fromMember", { name: inv.user_name })} · <InvoicePill status={inv.status} overdue={isOverdue(inv)} />
          </p>
        </div>
        <div className="admin-pagehead__actions">
          {inv.status === "draft" && (
            <button className="bibo-btn bibo-btn--ghost" onClick={remove}>{t("common.delete")}</button>
          )}
          {(inv.status === "sent" || inv.status === "paid") && (
            <button className="bibo-btn bibo-btn--ghost" disabled={busy} onClick={() => setStatus("void", "invoices.confirmVoid")}>
              {t("invoices.void")}
            </button>
          )}
          {inv.status === "paid" && (
            <button className="bibo-btn bibo-btn--secondary" disabled={busy} onClick={() => setStatus("sent")}>{t("invoices.markUnpaid")}</button>
          )}
          <button className="bibo-btn bibo-btn--secondary" onClick={() => window.print()}>
            {ic(IconPrinter)}
            <span>{t("invoices.print")}</span>
          </button>
          {inv.status === "sent" && (
            <button className="bibo-btn bibo-btn--primary" disabled={busy} onClick={() => setStatus("paid")}>{t("invoices.markPaid")}</button>
          )}
        </div>
      </div>

      {error && <Notice kind="danger">{error}</Notice>}
      {inv.status === "void" && <div className="bill-noprint"><Notice kind="info">{t("invoices.voidNote")}</Notice></div>}
      {inv.status === "draft" && <div className="bill-noprint"><Notice kind="info">{t("invoices.draftNote")}</Notice></div>}

      <div className="bibo-card bibo-card--default bill-doc">
        <div className="bill-doc__head">
          <div>
            <div className="bill-doc__lbl">{t("invoices.doc.from")}</div>
            <div className="bill-doc__block">
              <strong>{inv.user_name}</strong>
              {inv.user_login && `\n${inv.user_login}`}
              {inv.user_details && `\n${inv.user_details}`}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="bill-doc__lbl">{t("invoices.doc.invoice")}</div>
            <div className="bill-doc__num num">{inv.number}</div>
          </div>
        </div>
        <div className="bill-doc__meta">
          <div>
            <div className="bill-doc__lbl">{t("invoices.doc.billTo")}</div>
            <div className="bill-doc__block">
              <strong>{to.business_name}</strong>
              {to.billing_details && `\n${to.billing_details}`}
            </div>
          </div>
          <div>
            <div className="bill-doc__lbl">{t("invoices.col.issued")}</div>
            <div className="bill-doc__block">{fmtDay(inv.issue_date)}</div>
          </div>
          <div>
            <div className="bill-doc__lbl">{t("invoices.col.due")}</div>
            <div className="bill-doc__block">{fmtDay(inv.due_date)}</div>
          </div>
          <div>
            <div className="bill-doc__lbl">{t("invoices.doc.period")}</div>
            <div className="bill-doc__block">{fmtDay(inv.period_from)} – {fmtDay(inv.period_to)}</div>
          </div>
        </div>

        <table className="admin-table">
          <thead>
            <tr>
              <th>{t("invoices.col.item")}</th>
              <th className="r">{t("invoices.col.hours")}</th>
              <th className="r">{t("invoices.col.rate")}</th>
              <th className="r">{t("invoices.col.amount")}</th>
            </tr>
          </thead>
          <tbody>
            {(inv.lines ?? []).map((l, i) => (
              <tr key={i}>
                <td>{l.description}</td>
                <td className="r num">{fmtHours(l.seconds)}</td>
                <td className="r num">{money(l.rate_cents)}</td>
                <td className="r num">{money(l.amount_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bill-totals">
          <div><span>{t("invoices.subtotal")}</span><span className="num">{money(inv.subtotal_cents)}</span></div>
          {inv.tax_bp > 0 && (
            <div><span>{t("invoices.tax", { pct: inv.tax_bp / 100 })}</span><span className="num">{money(inv.tax_cents)}</span></div>
          )}
          <div className="bill-totals__grand"><span>{t("invoices.totalDue")}</span><span className="num">{money(inv.total_cents)}</span></div>
        </div>
        {inv.notes && <div className="bill-doc__notes">{inv.notes}</div>}
      </div>

    </div>
  );
}
