import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { billingApi, type Invoice } from "../../api/billing";
import { Empty, Notice, Spinner } from "../../components/ui";
import { useBusinesses } from "../../useBusinesses";
import { StatCard } from "../Dashboard";
import {
  IconAlert, IconArrowRight, IconCoins, IconReceipt, IconCheckList, InvoicePill,
  errText, fmtDay, fmtMoney, localDay, startOfMonth,
} from "./common";
import { BillingGate } from "./BillingGate";

export const isOverdue = (i: Invoice) => i.status === "sent" && i.due_date < localDay();

/** Invoices the team has raised against this workspace (ticket 159): what's waiting
 *  to be paid, what's overdue, and what was settled this month. Members create them
 *  in the desktop app; the owner records payment or voids. */
export function Invoices() {
  return <BillingGate>{(biz) => <InvoicesInner biz={biz} />}</BillingGate>;
}

function InvoicesInner({ biz }: { biz: string }) {
  const { t } = useTranslation("billing");
  const navigate = useNavigate();
  const { selected } = useBusinesses();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([billingApi.invoices(biz), billingApi.settings(biz)])
      .then(([i, s]) => {
        setInvoices(i.invoices);
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
      </div>

      {error && <Notice kind="danger">{error}</Notice>}

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
      {!loading && invoices.length === 0 && <Empty>{t("invoices.empty")}</Empty>}

      {invoices.length > 0 && (
        <div className="bibo-card bibo-card--default admin-tablecard">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("invoices.col.number")}</th>
                <th>{t("invoices.col.member")}</th>
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
                  <td>{i.user_name}</td>
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
    </div>
  );
}
