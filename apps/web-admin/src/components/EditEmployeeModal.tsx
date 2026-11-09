import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { removeEmployee, updateEmployee } from "../api/endpoints";
import { ApiError, type Employee } from "../api/types";
import { Modal, Notice } from "../components/ui";
import type { MemberTerms } from "../terms";

const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const IconPencil = svg(<><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /><path d="m15 5 4 4" /></>);
const IconClose = svg(<><path d="M18 6 6 18M6 6l12 12" /></>);
const IconDices = svg(<><rect width="12" height="12" x="2" y="10" rx="2" ry="2" /><path d="m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6" /><path d="M6 18h.01" /><path d="M10 14h.01" /><path d="M15 6h.01" /><path d="M18 9h.01" /></>);

/** Strong, readable temporary password the owner hands to the member. */
export function genTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const rnd = crypto.getRandomValues(new Uint32Array(10));
  for (let i = 0; i < 10; i++) out += chars[rnd[i] % chars.length];
  return out;
}

/** The pencil action shown on a member row. Owners aren't editable — the caller
 *  decides that; this is just the control, so every roster renders the same thing. */
export function EditMemberAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="admin-viewlink" onClick={onClick}>
      {IconPencil}
      {label}
    </button>
  );
}

/**
 * Edit a member: fix a mistyped name or login, hand out a new password, or drop them
 * from the roster (ticket 168 — owners previously had no way to correct any of this).
 * The password field is blank on open and only sent when filled in.
 */
export function EditEmployeeModal({
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
