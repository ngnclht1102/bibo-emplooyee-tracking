import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { billingApi, type BillingMember, type MemberRate } from "../../api/billing";
import { Notice, Spinner } from "../../components/ui";
import { useBusinesses } from "../../useBusinesses";
import {
  Dialog, DialogFoot, IconCoins, NameCell, Row2, TextField, centsToInput, errText, fmtDay, fmtMoney, localDay, parseMoney,
} from "./common";
import { BillingGate } from "./BillingGate";

const CURRENCIES = ["USD", "EUR", "GBP", "VND", "JPY", "CNY", "IDR", "SGD", "AUD", "CAD", "INR", "THB", "PHP", "MYR", "KRW"];

/** Workspace currency + invoice "from" details, and each person's hourly rate (with history). */
export function Rates() {
  return <BillingGate>{(biz) => <RatesInner biz={biz} />}</BillingGate>;
}

function RatesInner({ biz }: { biz: string }) {
  const { t } = useTranslation("billing");
  const { selected } = useBusinesses();
  const [members, setMembers] = useState<BillingMember[]>([]);
  const [rates, setRates] = useState<MemberRate[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<BillingMember | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([billingApi.members(biz, localDay()), billingApi.rates(biz), billingApi.settings(biz)])
      .then(([m, r, s]) => {
        setMembers(m.members);
        setRates(r.rates);
        setCurrency(s.currency);
        setDetails(s.billing_details);
      })
      .catch((e) => setError(errText(e, t("common.loadError"))))
      .finally(() => setLoading(false));
  }, [biz, t]);
  useEffect(load, [load]);

  async function saveSettings() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await billingApi.saveSettings(biz, { currency, billing_details: details });
      setNotice(t("rates.savedSettings"));
    } catch (e) {
      setError(errText(e, t("common.saveError")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-wrap" style={{ paddingBottom: 32 }}>
      <div className="admin-pagehead">
        <div className="admin-pagehead__main">
          <h1 className="admin-h1">{t("rates.title")}</h1>
          <p className="admin-sub">
            {selected?.name} · {t("rates.withRate", { count: members.filter((m) => m.rate_cents != null).length, total: members.length })}
          </p>
        </div>
      </div>

      {error && <Notice kind="danger">{error}</Notice>}
      {notice && <Notice kind="success">{notice}</Notice>}
      {loading && <Spinner label={t("common.loading")} />}

      {!loading && (
        <>
          <div className="admin-set-sec">{t("rates.people")}</div>
          <div className="bibo-card bibo-card--default admin-tablecard">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("common.person")}</th>
                  <th>{t("rates.col.role")}</th>
                  <th className="r">{t("rates.col.current")}</th>
                  <th className="r">{t("rates.col.since")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const since = rates.filter((r) => r.user_id === m.id && r.effective_from <= localDay())[0];
                  return (
                    <tr key={m.id}>
                      <td><NameCell id={m.id} name={m.name} sub={m.login} /></td>
                      <td>{t(`rates.role.${m.role}`)}</td>
                      <td className="r">
                        {m.rate_cents != null ? <span className="num">{fmtMoney(m.rate_cents, currency)}{t("common.perHour")}</span> : <span className="pill pill-warn">{t("rates.noRate")}</span>}
                      </td>
                      <td className="r admin-relt">{since ? fmtDay(since.effective_from) : "—"}</td>
                      <td className="r">
                        <button type="button" className="admin-viewlink" onClick={() => setEditing(m)}>{t("rates.setRate")}</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="bill-hint">{t("rates.peopleHint")}</p>

          <div className="admin-set-sec bill-section">{t("rates.invoicing")}</div>
          <div className="set-group">
            <div className="set-row">
              <div>
                <div className="set-title">{t("rates.currency")}</div>
                <div className="set-desc">{t("rates.currencyDesc")}</div>
              </div>
              <span className="bibo-input" style={{ width: 160 }}>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {(CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES]).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </span>
            </div>
            <div className="set-row">
              <div>
                <div className="set-title">{t("rates.details")}</div>
                <div className="set-desc">{t("rates.detailsDesc")}</div>
              </div>
              <span className="bibo-input bill-textarea" style={{ width: 340, maxWidth: "100%" }}>
                <textarea rows={4} value={details} placeholder={t("rates.detailsPlaceholder")} onChange={(e) => setDetails(e.target.value)} />
              </span>
            </div>
            <div className="set-row">
              <div />
              <button type="button" className="bibo-btn bibo-btn--primary" disabled={saving} onClick={saveSettings}>
                {saving ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </div>
        </>
      )}

      {editing && (
        <RateDialog biz={biz} member={editing} currency={currency} history={rates.filter((r) => r.user_id === editing.id)}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} onChanged={load} />
      )}
    </div>
  );
}

function RateDialog({
  biz, member, currency, history, onClose, onSaved, onChanged,
}: {
  biz: string;
  member: BillingMember;
  currency: string;
  history: MemberRate[];
  onClose: () => void;
  onSaved: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation("billing");
  const [rate, setRate] = useState(centsToInput(member.rate_cents));
  const [from, setFrom] = useState(history.length ? localDay() : "2000-01-01");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const cents = parseMoney(rate);
    if (cents == null) return setError(t("common.badMoney"));
    setBusy(true);
    setError(null);
    try {
      await billingApi.setRate(biz, { user_id: member.id, rate_cents: cents, effective_from: from });
      onSaved();
    } catch (e) {
      setError(errText(e, t("common.saveError")));
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: number) {
    try {
      await billingApi.deleteRate(biz, id);
      onChanged();
    } catch (e) {
      setError(errText(e, t("common.saveError")));
    }
  }

  return (
    <Dialog icon={IconCoins} title={t("rates.dialogTitle", { name: member.name })} onClose={onClose} onSubmit={save} error={error}
      foot={<DialogFoot onClose={onClose} busy={busy} label={t("common.save")} disabled={!rate.trim() || !from} />}>
      <Row2>
        <TextField label={t("rates.hourly", { currency })} value={rate} onChange={setRate} placeholder="25" required autoFocus />
        <TextField label={t("rates.effectiveFrom")} type="date" value={from} onChange={setFrom} required />
      </Row2>
      <span className="bill-hint">{t("rates.effectiveHint")}</span>
      {history.length > 0 && (
        <div className="bill-history">
          <div className="bill-doc__lbl">{t("rates.history")}</div>
          {history.map((r) => (
            <div key={r.id} className="bill-history__row">
              <span>{t("rates.fromDay", { day: fmtDay(r.effective_from) })}</span>
              <span>
                <span className="num">{fmtMoney(r.rate_cents, currency)}{t("common.perHour")}</span>{" "}
                <button type="button" className="bibo-btn bibo-btn--ghost bibo-btn--sm" onClick={() => remove(r.id)}>{t("common.delete")}</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
