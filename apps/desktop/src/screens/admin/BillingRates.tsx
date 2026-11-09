import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { billingApi, type Member, type MemberRate } from "../../work/billingApi";
import { errMsg } from "../../work/useTaskTimer";
import { fmtMoney } from "../../work/invoices";
import { Dlg, Field, IconUser } from "../../work/ui";

// Billing admin, native: each person's hourly rate, the same data web-admin shows under
// Billing → Rates. Rates are dated — time bills at the rate in force on the day it was
// logged, and issued invoices keep the numbers they froze. Setting the workspace currency
// and the invoice "from" details stays in web-admin; this screen only reads the currency.

const centsToInput = (cents: number | null) => (cents == null ? "" : String(cents / 100));
const parseMoney = (s: string): number | null => {
  const v = Number(s.trim().replace(/\s/g, "").replace(",", "."));
  return s.trim() === "" ? null : Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : null;
};
const today = () => new Date().toISOString().slice(0, 10);

export function BillingRates({ businessId, businessName }: { businessId: string; businessName: string }) {
  const { t } = useTranslation("tasks");
  const [members, setMembers] = useState<Member[]>([]);
  const [rates, setRates] = useState<MemberRate[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Member | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      billingApi.members(businessId, today()),
      billingApi.rates(businessId),
      billingApi.settings(businessId),
    ])
      .then(([m, r, s]) => {
        setMembers(m.members);
        setRates(r.rates);
        setCurrency(s.currency);
        setError(null);
      })
      .catch((e) => setError(errMsg(e, "")))
      .finally(() => setLoading(false));
  }, [businessId]);
  useEffect(load, [load]);

  const errText = error === null ? null : error || t("offline");
  const withRate = members.filter((m) => m.rate_cents != null).length;

  return (
    <div className="bb-members">
      <div className="bb-members__head">
        <div>
          <h1 className="bb-adminboard__title">{t("admin.rates.title")}</h1>
          <p className="bb-adminboard__who">
            {businessName} · {t("admin.rates.summary", { count: withRate, total: members.length })}
          </p>
        </div>
      </div>

      {errText && <div className="auth-err" role="alert">{errText}</div>}

      <div className="card bb-adminboard__tablecard">
        <div className="bb-panel__head bb-task-head">
          <div className="bb-panel__title">{t("admin.rates.card")}</div>
        </div>
        {loading ? (
          <div className="muted bb-adminboard__msg">{t("loading")}</div>
        ) : members.length === 0 ? (
          <div className="muted bb-adminboard__msg">{t("admin.rates.noPeople")}</div>
        ) : (
          <table className="bb-adminboard__table">
            <thead>
              <tr>
                <th>{t("admin.rates.col.person")}</th>
                <th>{t("admin.rates.col.role")}</th>
                <th className="r">{t("admin.rates.col.current")}</th>
                <th className="r">{t("admin.rates.col.since")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                // The newest rate already in force today is the one on show.
                const since = rates
                  .filter((r) => r.user_id === m.id && r.effective_from <= today())
                  .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0];
                return (
                  <tr key={m.id}>
                    <td>
                      <span className="bb-adminboard__nametxt" title={m.login}>{m.name}</span>
                    </td>
                    <td>
                      <span className="pill">
                        {t(m.role === "owner" ? "admin.rates.roleOwner" : "admin.rates.roleEmployee")}
                      </span>
                    </td>
                    <td className="r num">
                      {m.rate_cents != null
                        ? fmtMoney(m.rate_cents, currency) + t("admin.rates.perHour")
                        : <span className="pill pill-warn">{t("admin.rates.noRate")}</span>}
                    </td>
                    <td className="r muted">{since ? since.effective_from : "—"}</td>
                    <td className="r">
                      <button type="button" className="bb-adminboard__view" onClick={() => setEditing(m)}>
                        {t("admin.rates.setRate")}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="muted bb-members__hint">{t("admin.rates.hint")}</p>
      </div>

      {editing && (
        <RateDialog
          businessId={businessId}
          member={editing}
          currency={currency}
          history={rates
            .filter((r) => r.user_id === editing.id)
            .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
          onChanged={load}
        />
      )}
    </div>
  );
}

/**
 * Set a member's hourly rate from a chosen day. Earlier time keeps the old rate, so the
 * dialog also lists the history and lets a wrong entry be deleted.
 */
function RateDialog({
  businessId,
  member,
  currency,
  history,
  onClose,
  onSaved,
  onChanged,
}: {
  businessId: string;
  member: Member;
  currency: string;
  history: MemberRate[];
  onClose: () => void;
  onSaved: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation("tasks");
  const [rate, setRate] = useState(centsToInput(member.rate_cents));
  // A member's very first rate backdates, so time already logged isn't left unrated.
  const [from, setFrom] = useState(history.length ? today() : "2000-01-01");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const cents = parseMoney(rate);
    if (cents == null) {
      setError(t("admin.rates.badMoney"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await billingApi.setRate(businessId, { user_id: member.id, rate_cents: cents, effective_from: from });
      onSaved();
    } catch (e) {
      setError(errMsg(e, ""));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setBusy(true);
    try {
      await billingApi.deleteRate(businessId, id);
      onChanged();
    } catch (e) {
      setError(errMsg(e, ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dlg
      icon={<IconUser />}
      title={t("admin.rates.dialogTitle", { name: member.name })}
      onClose={onClose}
      onSubmit={save}
      error={error}
      busy={busy}
      submitLabel={t("admin.rates.save")}
    >
      <Field label={t("admin.rates.hourly", { currency })}>
        <input type="text" value={rate} placeholder="25" onChange={(e) => setRate(e.target.value)} autoFocus />
      </Field>
      <Field label={t("admin.rates.effectiveFrom")}>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      </Field>
      <p className="muted bb-members__hint">{t("admin.rates.effectiveHint")}</p>
      {history.length > 0 && (
        <div className="bb-rate-history">
          <div className="bibo-field__lbl">{t("admin.rates.history")}</div>
          {history.map((r) => (
            <div key={r.id} className="bb-rate-history__row">
              <span className="muted">{t("admin.rates.fromDay", { day: r.effective_from })}</span>
              <span>
                <span className="num">{fmtMoney(r.rate_cents, currency)}{t("admin.rates.perHour")}</span>{" "}
                <button type="button" className="bibo-btn bibo-btn--ghost bibo-btn--sm" disabled={busy} onClick={() => remove(r.id)}>
                  {t("admin.rates.delete")}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </Dlg>
  );
}
