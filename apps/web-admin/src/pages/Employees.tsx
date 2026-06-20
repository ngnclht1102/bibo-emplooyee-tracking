import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import {
  createBusiness,
  createEmployee,
  listBusinessEmployees,
} from "../api/endpoints";
import { ApiError, type Employee } from "../api/types";
import { BusinessPicker } from "../components/BusinessPicker";
import { Empty, Field, Modal, Notice, Spinner } from "../components/ui";
import { useBusinesses } from "../useBusinesses";
import { memberTerms, type MemberTerms } from "../terms";

export function Employees() {
  const { t } = useTranslation("dashboard");
  const {
    businesses,
    selected,
    selectedId,
    setSelectedId,
    loading: bizLoading,
    reload: reloadBiz,
  } = useBusinesses();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [showBiz, setShowBiz] = useState(false);
  const [showEmp, setShowEmp] = useState(false);
  const [autoCreatedNote, setAutoCreatedNote] = useState<string | null>(null);

  const terms = memberTerms(selected?.kind);

  function loadEmployees(id: string) {
    setLoading(true);
    setListError(null);
    listBusinessEmployees(id)
      .then((r) => setEmployees(r.employees))
      .catch(() => setListError(t("employees.errorLoadMembers", { members: terms.lowerMany })))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (selectedId) loadEmployees(selectedId);
    else setEmployees([]);
  }, [selectedId]);

  const hasBusiness = businesses.length > 0;

  return (
    <div>
      <div className="toolbar spread" style={{ justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "var(--fz-lg)", margin: 0 }}>{terms.many}</h1>
        <div className="row" style={{ gap: 8 }}>
          <BusinessPicker businesses={businesses} selectedId={selectedId} onChange={setSelectedId} />
          <button className="btn" onClick={() => setShowBiz(true)}>
            {t("employees.newBusiness")}
          </button>
          <button className="btn btn-primary" onClick={() => setShowEmp(true)}>
            {terms.addCta}
          </button>
        </div>
      </div>

      {!hasBusiness && !bizLoading && (
        <div style={{ marginBottom: 16 }}>
          <Notice kind="info">
            <Trans
              i18nKey="employees.noBusinessNotice"
              t={t}
              values={{ member: terms.lowerOne }}
              components={{ 1: <em /> }}
            />
          </Notice>
        </div>
      )}

      {autoCreatedNote && (
        <div style={{ marginBottom: 16 }}>
          <Notice kind="success">{autoCreatedNote}</Notice>
        </div>
      )}

      {bizLoading && <Spinner label={t("employees.loading")} />}
      {selected && (
        <div className="caption" style={{ marginBottom: 8 }}>
          <Trans
            i18nKey="employees.rosterFor"
            t={t}
            values={{ name: selected.name }}
            components={[<strong />]}
          />
        </div>
      )}

      {listError && <Notice kind="danger">{listError}</Notice>}
      {loading && <Spinner label={t("employees.loadingMembers", { members: terms.lowerMany })} />}

      {!loading && selectedId && employees.length === 0 && !listError && (
        <Empty>{t("employees.noMembersYet", { members: terms.lowerMany })}</Empty>
      )}

      {employees.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>{t("employees.table.name")}</th>
              <th>{t("employees.table.login")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id}>
                <td style={{ fontWeight: 500 }}>{e.display_name}</td>
                <td className="muted">{e.email || e.username}</td>
                <td style={{ textAlign: "right" }}>
                  <Link to={`/employees/${e.id}?business=${selectedId}`}>{t("employees.viewReports")}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showBiz && (
        <NewBusinessModal
          onClose={() => setShowBiz(false)}
          onCreated={async (id) => {
            setShowBiz(false);
            await reloadBiz();
            setSelectedId(id);
          }}
        />
      )}

      {showEmp && (
        <NewEmployeeModal
          businessId={selectedId}
          terms={terms}
          onClose={() => setShowEmp(false)}
          onCreated={async (newBusinessId, wasAutoCreated) => {
            setShowEmp(false);
            if (wasAutoCreated) {
              await reloadBiz();
              setSelectedId(newBusinessId);
              setAutoCreatedNote(
                t("employees.autoCreatedNote", { member: terms.lowerOne }),
              );
            } else if (selectedId) {
              loadEmployees(selectedId);
            }
          }}
        />
      )}
    </div>
  );
}

function NewBusinessModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation("dashboard");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const biz = await createBusiness(name.trim());
      onCreated(biz.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("newBusinessModal.errorCreate"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t("newBusinessModal.title")} onClose={onClose}>
      <form onSubmit={submit}>
        {error && (
          <div style={{ marginBottom: 12 }}>
            <Notice kind="danger">{error}</Notice>
          </div>
        )}
        <Field label={t("newBusinessModal.nameLabel")}>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
        </Field>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t("newBusinessModal.cancel")}
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? t("newBusinessModal.creating") : t("newBusinessModal.create")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function NewEmployeeModal({
  businessId,
  terms,
  onClose,
  onCreated,
}: {
  businessId: string | null;
  terms: MemberTerms;
  onClose: () => void;
  onCreated: (businessId: string, wasAutoCreated: boolean) => void;
}) {
  const { t } = useTranslation("dashboard");
  const [login, setLogin] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ login?: string; password?: string }>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const value = login.trim();
    const isEmail = value.includes("@");
    try {
      const res = await createEmployee({
        email: isEmail ? value : undefined,
        username: isEmail ? undefined : value.toLowerCase(),
        display_name: displayName.trim(),
        password,
        // Omit business_id when none is selected: backend auto-creates one.
        business_id: businessId ?? undefined,
      });
      onCreated(res.business.id, businessId === null);
    } catch (err) {
      if (err instanceof ApiError) {
        // Map well-known validation cases inline; otherwise show a banner.
        if (err.status === 409) {
          setFieldErrors({ login: t("newEmployeeModal.errorTaken") });
        } else if (/password/i.test(err.message)) {
          setFieldErrors({ password: err.message });
        } else if (/username/i.test(err.message)) {
          setFieldErrors({ login: err.message });
        } else {
          setError(err.message);
        }
      } else {
        setError(t("newEmployeeModal.errorCreate", { member: terms.lowerOne }));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={terms.addCta} onClose={onClose}>
      <form onSubmit={submit}>
        {!businessId && (
          <div style={{ marginBottom: 12 }}>
            <Notice kind="info">
              {t("newEmployeeModal.noBusinessSelected", { member: terms.lowerOne })}
            </Notice>
          </div>
        )}
        {error && (
          <div style={{ marginBottom: 12 }}>
            <Notice kind="danger">{error}</Notice>
          </div>
        )}
        <Field label={t("newEmployeeModal.displayName")}>
          <input
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            autoFocus
          />
        </Field>
        <Field label={t("newEmployeeModal.usernameOrEmail")} error={fieldErrors.login}>
          <input
            className="input"
            type="text"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoComplete="off"
            required
          />
        </Field>
        <Field label={t("newEmployeeModal.temporaryPassword")} error={fieldErrors.password}>
          <input
            className="input"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <div className="caption">
          {t("newEmployeeModal.shareCredentials", { member: terms.lowerOne })}
        </div>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t("newEmployeeModal.cancel")}
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? t("newEmployeeModal.adding") : terms.addCta}
          </button>
        </div>
      </form>
    </Modal>
  );
}
