import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { call as invoke } from "../../api";
import { AVATAR_PALETTE, initials, type RosterEntry } from "./AdminDashboard";

const svgp = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const IconPlus = () => (<svg {...svgp} width="16" height="16" aria-hidden><path d="M5 12h14" /><path d="M12 5v14" /></svg>);
const IconDice = () => (<svg {...svgp} width="15" height="15" aria-hidden><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M8 8h.01M16 8h.01M8 16h.01M16 16h.01M12 12h.01" /></svg>);

// A readable temporary password (owner hands it to the member). Avoids ambiguous
// characters; long enough for the backend's 8-char minimum.
function genPassword(): string {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// The Members (Nhân viên/Kids) admin screen: the workspace roster plus a modal to
// pre-provision a new member (username or email + temp password). Backend supports
// create + list only — no edit/delete yet.
export function Members({
  businessId,
  businessName,
}: {
  businessId: string;
  businessName: string;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<RosterEntry[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(() => {
    setRows(null);
    setListError(null);
    invoke<RosterEntry[]>("admin_roster", { businessId })
      .then(setRows)
      .catch((e) => setListError(String(e)));
  }, [businessId]);

  useEffect(() => {
    load();
  }, [load]);

  function openModal() {
    setDisplayName("");
    setLogin("");
    setPassword(genPassword());
    setFormError(null);
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const name = displayName.trim();
    const id = login.trim();
    if (!name || !id || password.length < 8) {
      setFormError(t("screens:admin.memberFormError"));
      return;
    }
    setBusy(true);
    setFormError(null);
    const isEmail = id.includes("@");
    try {
      await invoke("admin_create_employee", {
        businessId,
        displayName: name,
        email: isEmail ? id : null,
        username: isEmail ? null : id,
        password,
      });
      setOpen(false);
      load();
    } catch (err) {
      setFormError(String(err));
    } finally {
      setBusy(false);
    }
  }

  const list = rows ?? [];

  return (
    <div className="bb-members">
      <div className="bb-members__head">
        <div>
          <h1 className="bb-adminboard__title">{t("nav.Members")}</h1>
          <p className="bb-adminboard__who">
            {businessName} · {list.length} {t("screens:admin.employees").toLowerCase()}
          </p>
        </div>
        <button type="button" className="bibo-btn bibo-btn--primary bb-members__add" onClick={openModal}>
          <IconPlus /> {t("screens:admin.addMember")}
        </button>
      </div>

      {listError && <div className="auth-err" role="alert">{listError}</div>}

      <div className="card bb-adminboard__tablecard">
        {rows === null ? (
          <div className="muted bb-adminboard__msg">{t("loading")}</div>
        ) : rows.length === 0 ? (
          <div className="muted bb-adminboard__msg">{t("screens:admin.empty")}</div>
        ) : (
          <table className="bb-adminboard__table">
            <thead>
              <tr>
                <th>{t("screens:admin.employees")}</th>
                <th>{t("screens:admin.login")}</th>
                <th>{t("screens:admin.role")}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((e, i) => {
                const pal = AVATAR_PALETTE[i % AVATAR_PALETTE.length];
                return (
                  <tr key={e.id}>
                    <td>
                      <div className="bb-adminboard__name">
                        <span className="bb-adminboard__avatar" style={{ background: pal.bg, color: pal.fg }}>
                          {initials(e.display_name)}
                        </span>
                        <span className="bb-adminboard__nameid">
                          <span className="bb-adminboard__nametxt" title={e.display_name}>{e.display_name}</span>
                        </span>
                      </div>
                    </td>
                    <td className="bb-adminboard__login">{e.email || e.username}</td>
                    <td>
                      <span className="bibo-badge" style={{ background: pal.bg, color: pal.fg }}>
                        {e.role === "owner" ? t("screens:admin.roleOwner") : t("screens:admin.roleEmployee")}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {open && (
        <div className="bb-modal-overlay" onClick={() => !busy && setOpen(false)}>
          <form className="bb-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <div className="bb-modal__title">{t("screens:admin.addMember")}</div>

            {formError && <div className="auth-err" role="alert">{formError}</div>}

            <label className="auth-field">
              <span className="auth-field-lbl">{t("screens:admin.memberName")}</span>
              <div className="auth-input">
                <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus />
              </div>
            </label>

            <label className="auth-field">
              <span className="auth-field-lbl">{t("screens:admin.memberLogin")}</span>
              <div className="auth-input">
                <input type="text" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="an_nguyen" autoComplete="off" />
              </div>
            </label>

            <label className="auth-field">
              <span className="auth-field-lbl">{t("screens:admin.memberPassword")}</span>
              <div className="auth-input bb-modal__pw">
                <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" className="bb-modal__gen" onClick={() => setPassword(genPassword())} title={t("screens:admin.generate")}>
                  <IconDice /> {t("screens:admin.generate")}
                </button>
              </div>
            </label>

            <div className="bb-modal__actions">
              <button type="button" className="bibo-btn bibo-btn--secondary" onClick={() => setOpen(false)} disabled={busy}>
                {t("screens:admin.cancel")}
              </button>
              <button type="submit" className="bibo-btn bibo-btn--primary" disabled={busy}>
                {busy ? t("screens:admin.creating") : t("screens:admin.create")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
