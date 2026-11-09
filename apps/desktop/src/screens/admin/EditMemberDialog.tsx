import { useState } from "react";
import { useTranslation } from "react-i18next";
import { call as invoke } from "../../api";
import type { RosterEntry } from "./AdminDashboard";

const svgp = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const IconPencil = () => (<svg {...svgp} width="15" height="15" aria-hidden><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>);
const IconDice = () => (<svg {...svgp} width="15" height="15" aria-hidden><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M8 8h.01M16 8h.01M8 16h.01M16 16h.01M12 12h.01" /></svg>);
const IconX = () => (<svg {...svgp} width="18" height="18" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>);

// A readable temporary password (owner hands it to the member). Avoids ambiguous
// characters; long enough for the backend's 8-char minimum.
export function genPassword(): string {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/** The pencil action on a member row. Every roster renders this same control so the
 *  Members screen, the dashboard and Team Overview behave identically (ticket 168). */
export function EditMemberAction({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" className="bb-adminboard__view" onClick={onClick}>
      <IconPencil /> {t("screens:admin.memberEdit")}
    </button>
  );
}

/**
 * Edit a member: fix a mistyped name or login, hand out a new password, or drop them
 * from the workspace (ticket 168). The password field is blank on open and only sent
 * when filled in. `onDone` fires after a successful save or removal.
 */
export function EditMemberDialog({
  businessId,
  employee,
  onClose,
  onDone,
}: {
  businessId: string;
  employee: RosterEntry;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const wasLogin = employee.email || employee.username || "";
  const [name, setName] = useState(employee.display_name);
  const [login, setLogin] = useState(wasLogin);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The backend sends its 409 as a raw "backend returned 409: {…}" string; show the
  // one case an owner actually hits in their own language and pass anything else through.
  function toMessage(err: unknown): string {
    const raw = String(err);
    return raw.includes("409") ? t("screens:admin.memberLoginTaken") : raw;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (busy) return;
    const n = name.trim();
    const id = login.trim();
    if (!n || !id || (password !== "" && password.length < 8)) {
      setError(t("screens:admin.memberFormError"));
      return;
    }
    const isEmail = id.includes("@");
    setBusy(true);
    setError(null);
    try {
      await invoke("admin_update_employee", {
        businessId,
        employeeId: employee.id,
        displayName: n !== employee.display_name ? n : null,
        // Only send the pair when the login moved, so an untouched member keeps
        // whichever identifier they already had.
        email: id !== wasLogin ? (isEmail ? id : "") : null,
        username: id !== wasLogin ? (isEmail ? "" : id.toLowerCase()) : null,
        password: password !== "" ? password : null,
      });
      onDone();
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    if (!window.confirm(t("screens:admin.memberRemoveConfirm", { name: employee.display_name }))) return;
    setBusy(true);
    setError(null);
    try {
      await invoke("admin_remove_employee", { businessId, employeeId: employee.id });
      onDone();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bb-modal-overlay" onClick={() => !busy && onClose()}>
      <div className="bibo-dlg" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit}>
          <div className="bibo-dlg__head">
            <div className="bibo-dlg__icon"><IconPencil /></div>
            <div className="bibo-dlg__title">{t("screens:admin.memberEditTitle")}</div>
            <button type="button" className="bibo-dlg__close" aria-label={t("screens:admin.cancel")} onClick={onClose}>
              <IconX />
            </button>
          </div>
          <div className="bibo-dlg__body">
            {error && <div className="auth-err" role="alert">{error}</div>}
            <label className="bibo-field">
              <span className="bibo-field__lbl">{t("screens:admin.memberName")}</span>
              <span className="bibo-input">
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </span>
            </label>
            <label className="bibo-field">
              <span className="bibo-field__lbl">{t("screens:admin.memberLogin")}</span>
              <span className="bibo-input">
                <input type="text" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="off" />
              </span>
            </label>
            <label className="bibo-field">
              <span className="bibo-field__lbl">{t("screens:admin.memberNewPassword")}</span>
              <span className="bibo-dlg__pw">
                <span className="bibo-input">
                  <input
                    type="text"
                    value={password}
                    placeholder={t("screens:admin.memberPasswordKeep")}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </span>
                <button type="button" className="bibo-dlg__gen" onClick={() => setPassword(genPassword())} title={t("screens:admin.generate")}>
                  <IconDice /> {t("screens:admin.generate")}
                </button>
              </span>
            </label>
            <p className="muted bb-members__hint">{t("screens:admin.memberEditHint")}</p>
          </div>
          <div className="bibo-dlg__foot">
            <button type="button" className="bibo-btn bibo-btn--ghost bb-members__remove" onClick={remove} disabled={busy}>
              {t("screens:admin.memberRemove")}
            </button>
            <button type="button" className="bibo-btn bibo-btn--ghost" onClick={onClose} disabled={busy}>
              {t("screens:admin.cancel")}
            </button>
            <button type="submit" className="bibo-btn bibo-btn--primary" disabled={busy}>
              {busy ? t("screens:admin.memberSaving") : t("screens:admin.memberSave")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
