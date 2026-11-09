import { useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import {
  createBusiness,
  createEmployee,
  listBusinessEmployees,
  removeEmployee,
  reportEmployees,
  updateEmployee,
} from "../api/endpoints";
import { ApiError, type BusinessKind, type Employee } from "../api/types";
import { Empty, Modal, Notice, Spinner } from "../components/ui";
import { useBusinesses } from "../useBusinesses";
import { memberTerms, type MemberTerms } from "../terms";
import { useAuth } from "../auth/AuthContext";
import { memberStatus } from "./Dashboard";

// ── display-only helpers (mirror the Dashboard roster look) ──────────
const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const IconPlus = svg(<><path d="M5 12h14" /><path d="M12 5v14" /></>);
const IconUserPlus = svg(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" x2="19" y1="8" y2="14" /><line x1="22" x2="16" y1="11" y2="11" /></>);
const IconArrowRight = svg(<><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>);
const IconBuilding = svg(<><path d="M10 12h4" /><path d="M10 8h4" /><path d="M14 21v-3a2 2 0 0 0-4 0v3" /><path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2" /><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" /></>);
const IconClose = svg(<><path d="M18 6 6 18M6 6l12 12" /></>);
const IconHouse = svg(<><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" /><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>);
const IconPencil = svg(<><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /><path d="m15 5 4 4" /></>);
const IconDices = svg(<><rect width="12" height="12" x="2" y="10" rx="2" ry="2" /><path d="m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6" /><path d="M6 18h.01" /><path d="M10 14h.01" /><path d="M15 6h.01" /><path d="M18 9h.01" /></>);

/** Local strong temp-password generator (mirrors the wizard's). */
function genTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const rnd = crypto.getRandomValues(new Uint32Array(10));
  for (let i = 0; i < 10; i++) out += chars[rnd[i] % chars.length];
  return out;
}

const AVATAR_PALETTE = [
  { bg: "var(--info-soft)", fg: "var(--info)" },
  { bg: "var(--positive-soft)", fg: "var(--positive)" },
  { bg: "color-mix(in srgb, var(--data-rose) 18%, transparent)", fg: "var(--data-rose)" },
  { bg: "color-mix(in srgb, var(--data-amber) 22%, transparent)", fg: "var(--data-amber)" },
];
const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

export function Employees() {
  const { t } = useTranslation("dashboard");
  const { user } = useAuth();
  const {
    businesses,
    selected,
    selectedId,
    setSelectedId,
    loading: bizLoading,
    reload: reloadBiz,
  } = useBusinesses();

  const [employees, setEmployees] = useState<Employee[]>([]);
  // Presence comes from the roster report (the members list has no last_seen);
  // members missing from it — or a failed load — show no dot rather than a guess.
  const [lastSeen, setLastSeen] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [showBiz, setShowBiz] = useState(false);
  const [showEmp, setShowEmp] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [autoCreatedNote, setAutoCreatedNote] = useState<string | null>(null);

  const terms = memberTerms(selected?.kind);

  function loadEmployees(id: string) {
    setLoading(true);
    setListError(null);
    listBusinessEmployees(id)
      .then((r) => setEmployees(r.employees))
      .catch(() => setListError(t("employees.errorLoadMembers", { members: terms.lowerMany })))
      .finally(() => setLoading(false));
    reportEmployees(id)
      .then((r) => setLastSeen(Object.fromEntries(r.employees.map((e) => [e.id, e.last_seen]))))
      .catch(() => setLastSeen({}));
  }

  useEffect(() => {
    if (selectedId) loadEmployees(selectedId);
    else setEmployees([]);
  }, [selectedId]);

  // Open the "new business" modal when arrived here via the topbar picker (?new=1).
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get("new") === null) return;
    setShowBiz(true);
    searchParams.delete("new");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const hasBusiness = businesses.length > 0;

  return (
    <div className="admin-wrap" style={{ paddingBottom: 32 }}>
      <div className="admin-pagehead">
        <div className="admin-pagehead__main">
          <h1 className="admin-h1">{terms.many}</h1>
          {selected && (
            <p className="admin-sub">
              {selected.name} · {employees.length} {terms.many}
            </p>
          )}
        </div>
        <div className="admin-pagehead__actions">
          <button className="bibo-btn bibo-btn--secondary" onClick={() => setShowBiz(true)}>
            <span style={{ display: "inline-flex", lineHeight: 0 }}>{IconPlus}</span>
            <span>{t("employees.newOrg", { org: terms.org })}</span>
          </button>
          <button className="bibo-btn bibo-btn--primary" onClick={() => setShowEmp(true)}>
            <span style={{ display: "inline-flex", lineHeight: 0 }}>{IconUserPlus}</span>
            <span>{terms.addCta}</span>
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

      {listError && <Notice kind="danger">{listError}</Notice>}
      {loading && <Spinner label={t("employees.loadingMembers", { members: terms.lowerMany })} />}

      {!loading && selectedId && employees.length === 0 && !listError && (
        <Empty>{t("employees.noMembersYet", { members: terms.lowerMany })}</Empty>
      )}

      {employees.length > 0 && (
        <div className="bibo-card bibo-card--default admin-tablecard">
          <table className="admin-table admin-table--roster">
            <thead>
              <tr>
                <th>{t("employees.table.name")}</th>
                <th>{t("employees.table.login")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e, i) => {
                const pal = AVATAR_PALETTE[i % AVATAR_PALETTE.length];
                const isSelf = e.id === user?.id;
                const status = e.id in lastSeen ? memberStatus(lastSeen[e.id]) : null;
                return (
                  <tr key={e.id}>
                    <td>
                      <div className="admin-name">
                        <span className="bibo-avatar" style={{ ["--_s" as string]: "34px" }}>
                          <span className="bibo-avatar__img" aria-label={e.display_name} style={{ background: pal.bg, color: pal.fg }}>
                            {initials(e.display_name)}
                          </span>
                          {status && <span className={`bibo-avatar__dot bibo-avatar__dot--${status}`} />}
                        </span>
                        <span className="admin-name__txt">
                          {e.display_name}
                          {isSelf && <span className="admin-self">{t("dashboard.selfBadge")}</span>}
                        </span>
                      </div>
                    </td>
                    <td className="admin-login">{e.email || e.username}</td>
                    <td className="r">
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 16 }}>
                        {!isSelf && (
                          <button type="button" className="admin-viewlink" onClick={() => setEditing(e)}>
                            {IconPencil}
                            {t("employees.edit")}
                          </button>
                        )}
                        <Link className="admin-viewlink" to={`/employees/${e.id}?business=${selectedId}`}>
                          {t("employees.viewReports")}
                          {IconArrowRight}
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showBiz && (
        <NewBusinessModal
          terms={terms}
          kind={selected?.kind}
          onClose={() => setShowBiz(false)}
          onCreated={async (id) => {
            setShowBiz(false);
            await reloadBiz();
            setSelectedId(id);
          }}
        />
      )}

      {editing && selectedId && (
        <EditEmployeeModal
          businessId={selectedId}
          employee={editing}
          terms={terms}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            loadEmployees(selectedId);
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
  terms,
  kind,
  onClose,
  onCreated,
}: {
  terms: MemberTerms;
  kind: BusinessKind | undefined;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation("dashboard");
  const isFamily = kind === "family";
  const orgCap = terms.org.charAt(0).toUpperCase() + terms.org.slice(1);
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
    <Modal wide onClose={onClose}>
      <div className="bibo-dlg bibo-dlg--org" role="dialog" aria-modal="true">
        <div className="bibo-dlg__head">
          <div className="bibo-dlg__icon">
            <span style={{ display: "inline-flex", lineHeight: 0 }}>{isFamily ? IconHouse : IconBuilding}</span>
          </div>
          <div className="bibo-dlg__title">{t("employees.newOrg", { org: terms.org })}</div>
          <button
            type="button"
            className="bibo-dlg__close"
            aria-label={t("newBusinessModal.cancel")}
            onClick={onClose}
          >
            {IconClose}
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="bibo-dlg__body">
            {error && (
              <div style={{ marginBottom: 12 }}>
                <Notice kind="danger">{error}</Notice>
              </div>
            )}
            <label className="bibo-field">
              <span className="bibo-field__lbl">{t("newBusinessModal.orgNameLabel", { org: orgCap })}</span>
              <span className="bibo-input">
                <input
                  placeholder={t(isFamily ? "newBusinessModal.namePlaceholderFamily" : "newBusinessModal.namePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                />
              </span>
            </label>
          </div>
          <div className="bibo-dlg__foot">
            <button type="button" className="bibo-btn bibo-btn--ghost" onClick={onClose}>
              {t("newBusinessModal.cancel")}
            </button>
            <button className="bibo-btn bibo-btn--primary" disabled={busy || !name.trim()}>
              {busy ? t("newBusinessModal.creating") : t("newBusinessModal.create")}
            </button>
          </div>
        </form>
      </div>
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
    <Modal wide onClose={onClose}>
      <div className="bibo-dlg" role="dialog" aria-modal="true" style={{ ["--_w" as string]: "460px" }}>
        <div className="bibo-dlg__head">
          <div className="bibo-dlg__icon">
            <span style={{ display: "inline-flex", lineHeight: 0 }}>{IconUserPlus}</span>
          </div>
          <div className="bibo-dlg__title">{terms.addCta}</div>
          <button
            type="button"
            className="bibo-dlg__close"
            aria-label={t("newEmployeeModal.cancel")}
            onClick={onClose}
          >
            {IconClose}
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="bibo-dlg__body">
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
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label className="bibo-field">
                <span className="bibo-field__lbl">{t("newEmployeeModal.displayName")}</span>
                <span className="bibo-input">
                  <input
                    placeholder="Mia"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    autoFocus
                  />
                </span>
              </label>
              <label className="bibo-field">
                <span className="bibo-field__lbl">{t("newEmployeeModal.usernameOrEmail")}</span>
                <span className="bibo-input">
                  <input
                    type="text"
                    placeholder="mia_home"
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    autoComplete="off"
                    required
                  />
                </span>
                {fieldErrors.login && <div className="error-text">{fieldErrors.login}</div>}
              </label>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <div style={{ flex: "1 1 0%" }}>
                  <label className="bibo-field">
                    <span className="bibo-field__lbl">{t("newEmployeeModal.temporaryPassword")}</span>
                    <span className="bibo-input bibo-input--dots">
                      <input
                        type="text"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                    </span>
                    {fieldErrors.password && <div className="error-text">{fieldErrors.password}</div>}
                  </label>
                </div>
                <button
                  type="button"
                  className="bibo-btn bibo-btn--secondary"
                  title={t("newEmployeeModal.generate")}
                  onClick={() => setPassword(genTempPassword())}
                >
                  <span style={{ display: "inline-flex", lineHeight: 0 }}>{IconDices}</span>
                  <span>{t("newEmployeeModal.generate")}</span>
                </button>
              </div>
            </div>
          </div>
          <div className="bibo-dlg__foot">
            <button type="button" className="bibo-btn bibo-btn--ghost" onClick={onClose}>
              {t("newEmployeeModal.cancel")}
            </button>
            <button
              className="bibo-btn bibo-btn--primary"
              disabled={busy || !displayName.trim() || !login.trim() || !password}
            >
              {busy ? t("newEmployeeModal.adding") : terms.addCta}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

/**
 * Edit a member: fix a mistyped name or login, hand out a new password, or drop them
 * from the roster (ticket 168 — owners previously had no way to correct any of this).
 * The password field is blank on open and only sent when filled in.
 */
function EditEmployeeModal({
  businessId,
  employee,
  terms,
  onClose,
  onDone,
}: {
  businessId: string;
  employee: Employee;
  terms: MemberTerms;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation("dashboard");
  const originalLogin = employee.email || employee.username || "";
  const [login, setLogin] = useState(originalLogin);
  const [displayName, setDisplayName] = useState(employee.display_name);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ login?: string; password?: string }>({});

  const dirty =
    displayName.trim() !== employee.display_name || login.trim() !== originalLogin || password !== "";

  function fail(err: unknown, fallback: string) {
    if (err instanceof ApiError) {
      // Same mapping as the add dialog: known validation cases land on the field.
      if (err.status === 409) setFieldErrors({ login: t("newEmployeeModal.errorTaken") });
      else if (/password/i.test(err.message)) setFieldErrors({ password: err.message });
      else if (/username/i.test(err.message)) setFieldErrors({ login: err.message });
      else setError(err.message);
    } else {
      setError(fallback);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const value = login.trim();
    const isEmail = value.includes("@");
    try {
      await updateEmployee(businessId, employee.id, {
        // Send the login pair only when it actually changed, so an untouched member
        // keeps whichever identifier they already had.
        ...(value !== originalLogin
          ? { email: isEmail ? value : "", username: isEmail ? "" : value.toLowerCase() }
          : {}),
        ...(displayName.trim() !== employee.display_name ? { display_name: displayName.trim() } : {}),
        ...(password ? { password } : {}),
      });
      onDone();
    } catch (err) {
      fail(err, t("editEmployeeModal.errorSave", { member: terms.lowerOne }));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(t("editEmployeeModal.confirmRemove", { name: employee.display_name }))) return;
    setBusy(true);
    setError(null);
    try {
      await removeEmployee(businessId, employee.id);
      onDone();
    } catch (err) {
      fail(err, t("editEmployeeModal.errorRemove", { member: terms.lowerOne }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal wide onClose={onClose}>
      <div className="bibo-dlg" role="dialog" aria-modal="true" style={{ ["--_w" as string]: "460px" }}>
        <div className="bibo-dlg__head">
          <div className="bibo-dlg__icon">
            <span style={{ display: "inline-flex", lineHeight: 0 }}>{IconPencil}</span>
          </div>
          <div className="bibo-dlg__title">{t("editEmployeeModal.title", { member: terms.lowerOne })}</div>
          <button
            type="button"
            className="bibo-dlg__close"
            aria-label={t("newEmployeeModal.cancel")}
            onClick={onClose}
          >
            {IconClose}
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="bibo-dlg__body">
            {error && (
              <div style={{ marginBottom: 12 }}>
                <Notice kind="danger">{error}</Notice>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label className="bibo-field">
                <span className="bibo-field__lbl">{t("newEmployeeModal.displayName")}</span>
                <span className="bibo-input">
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    autoFocus
                  />
                </span>
              </label>
              <label className="bibo-field">
                <span className="bibo-field__lbl">{t("newEmployeeModal.usernameOrEmail")}</span>
                <span className="bibo-input">
                  <input
                    type="text"
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    autoComplete="off"
                    required
                  />
                </span>
                {fieldErrors.login && <div className="error-text">{fieldErrors.login}</div>}
              </label>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <div style={{ flex: "1 1 0%" }}>
                  <label className="bibo-field">
                    <span className="bibo-field__lbl">{t("editEmployeeModal.newPassword")}</span>
                    <span className="bibo-input bibo-input--dots">
                      <input
                        type="text"
                        placeholder={t("editEmployeeModal.passwordUnchanged")}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </span>
                    {fieldErrors.password && <div className="error-text">{fieldErrors.password}</div>}
                  </label>
                </div>
                <button
                  type="button"
                  className="bibo-btn bibo-btn--secondary"
                  title={t("newEmployeeModal.generate")}
                  onClick={() => setPassword(genTempPassword())}
                >
                  <span style={{ display: "inline-flex", lineHeight: 0 }}>{IconDices}</span>
                  <span>{t("newEmployeeModal.generate")}</span>
                </button>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <Notice kind="info">{t("editEmployeeModal.loginHint", { member: terms.lowerOne })}</Notice>
            </div>
          </div>
          <div className="bibo-dlg__foot">
            <button
              type="button"
              className="bibo-btn bibo-btn--ghost"
              style={{ marginRight: "auto", color: "var(--danger)" }}
              disabled={busy}
              onClick={remove}
            >
              {t("editEmployeeModal.remove")}
            </button>
            <button type="button" className="bibo-btn bibo-btn--ghost" onClick={onClose}>
              {t("newEmployeeModal.cancel")}
            </button>
            <button
              className="bibo-btn bibo-btn--primary"
              disabled={busy || !dirty || !displayName.trim() || !login.trim()}
            >
              {busy ? t("editEmployeeModal.saving") : t("editEmployeeModal.save")}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
