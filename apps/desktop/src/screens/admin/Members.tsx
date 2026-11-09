import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { call as invoke } from "../../api";
import { AVATAR_PALETTE, initials, localDayStart, type OwnerBusiness, type RosterEntry } from "./AdminDashboard";
import { EmployeeDetail } from "./EmployeeDetail";

const svgp = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const IconPlus = () => (<svg {...svgp} width="16" height="16" aria-hidden><path d="M5 12h14" /><path d="M12 5v14" /></svg>);
const IconDice = () => (<svg {...svgp} width="15" height="15" aria-hidden><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M8 8h.01M16 8h.01M8 16h.01M16 16h.01M12 12h.01" /></svg>);
const IconCopy = () => (<svg {...svgp} width="14" height="14" aria-hidden><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>);
const IconArrow = () => (<svg {...svgp} width="15" height="15" aria-hidden><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>);
const IconPencil = () => (<svg {...svgp} width="15" height="15" aria-hidden><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>);
const IconX = () => (<svg {...svgp} width="18" height="18" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>);
const IconHome = () => (<svg {...svgp} width="20" height="20" aria-hidden><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M9 21v-6h6v6" /></svg>);
const IconTeam = () => (<svg {...svgp} width="20" height="20" aria-hidden><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>);
const IconUserPlus = () => (<svg {...svgp} width="20" height="20" aria-hidden><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></svg>);
const IconCheck = () => (<svg {...svgp} width="20" height="20" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>);

type Status = "active" | "idle" | "offline";
function memberStatus(lastSeen: number | null): Status {
  if (!lastSeen) return "offline";
  const age = Date.now() / 1000 - lastSeen;
  if (age < 5 * 60) return "active";
  if (age < 30 * 60) return "idle";
  return "offline";
}

// A readable temporary password (owner hands it to the member). Avoids ambiguous
// characters; long enough for the backend's 8-char minimum.
function genPassword(): string {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

type Created = { login: string; password: string };

// The Members (Nhân viên/Kids) admin screen: the workspace roster (drill into a
// member's native detail) plus a modal to pre-provision a new member. After
// creating, the login + temp password are shown for hand-off. A member can also be
// edited (name, login, new password) or detached from the workspace (ticket 168).
export function Members({
  businessId,
  businessName,
  businessKind,
  onWorkspaceCreated,
  detail,
  onView,
}: {
  businessId: string;
  businessName: string;
  businessKind: string;
  onWorkspaceCreated: (b: OwnerBusiness) => void;
  detail: RosterEntry | null;
  onView: (e: RosterEntry | null) => void;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<RosterEntry[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  // create-workspace modal
  const [wsOpen, setWsOpen] = useState(false);
  const [wsName, setWsName] = useState("");
  const [wsBusy, setWsBusy] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);
  const isFamily = businessKind === "family";
  const newWorkspaceLabel = isFamily ? t("screens:admin.newFamily") : t("screens:admin.newTeam");
  const wsNameLabel = isFamily ? t("screens:admin.workspaceNameFamily") : t("screens:admin.workspaceNameTeam");
  const wsPlaceholder = isFamily ? t("screens:admin.workspacePhFamily") : t("screens:admin.workspacePhTeam");

  async function submitWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (wsBusy) return;
    const name = wsName.trim();
    if (!name) {
      setWsError(t("screens:admin.workspaceNameError"));
      return;
    }
    setWsBusy(true);
    setWsError(null);
    try {
      const biz = await invoke<OwnerBusiness>("admin_create_business", { name });
      setWsOpen(false);
      setWsName("");
      onWorkspaceCreated(biz);
    } catch (err) {
      setWsError(String(err));
    } finally {
      setWsBusy(false);
    }
  }

  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    setRows(null);
    setListError(null);
    invoke<RosterEntry[]>("admin_roster", { businessId, dayStart: localDayStart() })
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
    setCreated(null);
    setCopied(false);
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    if (created) load(); // a member was created while the modal was open
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
      setCreated({ login: id, password });
    } catch (err) {
      setFormError(String(err));
    } finally {
      setBusy(false);
    }
  }

  // ── edit / remove a member (ticket 168) ──────────────────────────────
  const [edit, setEdit] = useState<RosterEntry | null>(null);
  const [eName, setEName] = useState("");
  const [eLogin, setELogin] = useState("");
  const [ePassword, setEPassword] = useState("");
  const [eBusy, setEBusy] = useState(false);
  const [eError, setEError] = useState<string | null>(null);

  function openEdit(e: RosterEntry) {
    setEName(e.display_name);
    setELogin(e.email || e.username || "");
    setEPassword("");
    setEError(null);
    setEdit(e);
  }

  // The backend sends its 409 as a raw "backend returned 409: {…}" string; show the
  // one case an owner actually hits in their own language and pass anything else through.
  function editError(err: unknown): string {
    const raw = String(err);
    return raw.includes("409") ? t("screens:admin.memberLoginTaken") : raw;
  }

  async function submitEdit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!edit || eBusy) return;
    const name = eName.trim();
    const id = eLogin.trim();
    if (!name || !id || (ePassword !== "" && ePassword.length < 8)) {
      setEError(t("screens:admin.memberFormError"));
      return;
    }
    const wasLogin = edit.email || edit.username || "";
    const isEmail = id.includes("@");
    setEBusy(true);
    setEError(null);
    try {
      await invoke("admin_update_employee", {
        businessId,
        employeeId: edit.id,
        displayName: name !== edit.display_name ? name : null,
        // Only send the pair when the login moved, so an untouched member keeps
        // whichever identifier they already had.
        email: id !== wasLogin ? (isEmail ? id : "") : null,
        username: id !== wasLogin ? (isEmail ? "" : id.toLowerCase()) : null,
        password: ePassword !== "" ? ePassword : null,
      });
      setEdit(null);
      load();
    } catch (err) {
      setEError(editError(err));
    } finally {
      setEBusy(false);
    }
  }

  async function submitRemove() {
    if (!edit || eBusy) return;
    if (!window.confirm(t("screens:admin.memberRemoveConfirm", { name: edit.display_name }))) return;
    setEBusy(true);
    setEError(null);
    try {
      await invoke("admin_remove_employee", { businessId, employeeId: edit.id });
      setEdit(null);
      load();
    } catch (err) {
      setEError(String(err));
    } finally {
      setEBusy(false);
    }
  }

  async function copyCreds() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(`${created.login} / ${created.password}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — the values are on screen to copy manually */
    }
  }

  if (detail) {
    return <EmployeeDetail employee={detail} onBack={() => onView(null)} />;
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
        <div className="bb-members__actions">
          <button type="button" className="bibo-btn bibo-btn--secondary bb-members__add" onClick={() => { setWsName(""); setWsError(null); setWsOpen(true); }}>
            <IconPlus /> {newWorkspaceLabel}
          </button>
          <button type="button" className="bibo-btn bibo-btn--primary bb-members__add" onClick={openModal}>
            <IconPlus /> {t("screens:admin.addMember")}
          </button>
        </div>
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((e, i) => {
                const pal = AVATAR_PALETTE[i % AVATAR_PALETTE.length];
                const status = memberStatus(e.last_seen);
                return (
                  <tr key={e.id}>
                    <td>
                      <div className="bb-adminboard__name">
                        <span className="bb-adminboard__avatar" style={{ background: pal.bg, color: pal.fg }}>
                          {initials(e.display_name)}
                          <span className={`bb-adminboard__dot bb-adminboard__dot--${status}`} />
                        </span>
                        <span className="bb-adminboard__nameid">
                          <span className="bb-adminboard__nametxt" title={e.display_name}>{e.display_name}</span>
                          {e.role === "owner" && (
                            <span className="bibo-badge bb-adminboard__you" style={{ background: pal.bg, color: pal.fg }}>
                              {t("screens:admin.you")}
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="bb-adminboard__login">{e.email || e.username}</td>
                    <td>
                      <span className="bibo-badge" style={{ background: pal.bg, color: pal.fg }}>
                        {e.role === "owner" ? t("screens:admin.roleOwner") : t("screens:admin.roleEmployee")}
                      </span>
                    </td>
                    <td className="r">
                      <div className="bb-adminboard__rowacts">
                        {e.role !== "owner" && (
                          <button type="button" className="bb-adminboard__view" onClick={() => openEdit(e)}>
                            <IconPencil /> {t("screens:admin.memberEdit")}
                          </button>
                        )}
                        <button type="button" className="bb-adminboard__view" onClick={() => onView(e)}>
                          {t("screens:admin.view")} <IconArrow />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {open && (
        <div className="bb-modal-overlay" onClick={() => !busy && closeModal()}>
          <div className="bibo-dlg" onClick={(e) => e.stopPropagation()}>
            {created ? (
              <>
                <div className="bibo-dlg__head">
                  <div className="bibo-dlg__icon"><IconCheck /></div>
                  <div className="bibo-dlg__title">{t("screens:admin.memberCreated")}</div>
                  <button type="button" className="bibo-dlg__close" aria-label={t("screens:admin.done")} onClick={closeModal}>
                    <IconX />
                  </button>
                </div>
                <div className="bibo-dlg__body">
                  <p className="bb-modal__hint">{t("screens:admin.credsHint")}</p>
                  <div className="bibo-dlg__creds">
                    <div><span className="bibo-dlg__credlbl">{t("screens:admin.memberLogin")}</span><span className="num">{created.login}</span></div>
                    <div><span className="bibo-dlg__credlbl">{t("screens:admin.memberPassword")}</span><span className="num">{created.password}</span></div>
                  </div>
                </div>
                <div className="bibo-dlg__foot">
                  <button type="button" className="bibo-btn bibo-btn--ghost" onClick={copyCreds}>
                    <IconCopy /> {copied ? t("screens:admin.copied") : t("screens:admin.copy")}
                  </button>
                  <button type="button" className="bibo-btn bibo-btn--primary" onClick={closeModal}>
                    {t("screens:admin.done")}
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={submit}>
                <div className="bibo-dlg__head">
                  <div className="bibo-dlg__icon"><IconUserPlus /></div>
                  <div className="bibo-dlg__title">{t("screens:admin.addMember")}</div>
                  <button type="button" className="bibo-dlg__close" aria-label={t("screens:admin.cancel")} onClick={closeModal}>
                    <IconX />
                  </button>
                </div>
                <div className="bibo-dlg__body">
                  {formError && <div className="auth-err" role="alert">{formError}</div>}
                  <label className="bibo-field">
                    <span className="bibo-field__lbl">{t("screens:admin.memberName")}</span>
                    <span className="bibo-input">
                      <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus />
                    </span>
                  </label>
                  <label className="bibo-field">
                    <span className="bibo-field__lbl">{t("screens:admin.memberLogin")}</span>
                    <span className="bibo-input">
                      <input type="text" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="an_nguyen" autoComplete="off" />
                    </span>
                  </label>
                  <label className="bibo-field">
                    <span className="bibo-field__lbl">{t("screens:admin.memberPassword")}</span>
                    <span className="bibo-dlg__pw">
                      <span className="bibo-input">
                        <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
                      </span>
                      <button type="button" className="bibo-dlg__gen" onClick={() => setPassword(genPassword())} title={t("screens:admin.generate")}>
                        <IconDice /> {t("screens:admin.generate")}
                      </button>
                    </span>
                  </label>
                </div>
                <div className="bibo-dlg__foot">
                  <button type="button" className="bibo-btn bibo-btn--ghost" onClick={closeModal} disabled={busy}>
                    {t("screens:admin.cancel")}
                  </button>
                  <button type="submit" className="bibo-btn bibo-btn--primary" disabled={busy}>
                    {busy ? t("screens:admin.creating") : t("screens:admin.create")}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {edit && (
        <div className="bb-modal-overlay" onClick={() => !eBusy && setEdit(null)}>
          <div className="bibo-dlg" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={submitEdit}>
              <div className="bibo-dlg__head">
                <div className="bibo-dlg__icon"><IconPencil /></div>
                <div className="bibo-dlg__title">{t("screens:admin.memberEditTitle")}</div>
                <button type="button" className="bibo-dlg__close" aria-label={t("screens:admin.cancel")} onClick={() => setEdit(null)}>
                  <IconX />
                </button>
              </div>
              <div className="bibo-dlg__body">
                {eError && <div className="auth-err" role="alert">{eError}</div>}
                <label className="bibo-field">
                  <span className="bibo-field__lbl">{t("screens:admin.memberName")}</span>
                  <span className="bibo-input">
                    <input type="text" value={eName} onChange={(e) => setEName(e.target.value)} autoFocus />
                  </span>
                </label>
                <label className="bibo-field">
                  <span className="bibo-field__lbl">{t("screens:admin.memberLogin")}</span>
                  <span className="bibo-input">
                    <input type="text" value={eLogin} onChange={(e) => setELogin(e.target.value)} autoComplete="off" />
                  </span>
                </label>
                <label className="bibo-field">
                  <span className="bibo-field__lbl">{t("screens:admin.memberNewPassword")}</span>
                  <span className="bibo-dlg__pw">
                    <span className="bibo-input">
                      <input
                        type="text"
                        value={ePassword}
                        placeholder={t("screens:admin.memberPasswordKeep")}
                        onChange={(e) => setEPassword(e.target.value)}
                      />
                    </span>
                    <button type="button" className="bibo-dlg__gen" onClick={() => setEPassword(genPassword())} title={t("screens:admin.generate")}>
                      <IconDice /> {t("screens:admin.generate")}
                    </button>
                  </span>
                </label>
                <p className="muted bb-members__hint">{t("screens:admin.memberEditHint")}</p>
              </div>
              <div className="bibo-dlg__foot">
                <button type="button" className="bibo-btn bibo-btn--ghost bb-members__remove" onClick={submitRemove} disabled={eBusy}>
                  {t("screens:admin.memberRemove")}
                </button>
                <button type="button" className="bibo-btn bibo-btn--ghost" onClick={() => setEdit(null)} disabled={eBusy}>
                  {t("screens:admin.cancel")}
                </button>
                <button type="submit" className="bibo-btn bibo-btn--primary" disabled={eBusy}>
                  {eBusy ? t("screens:admin.memberSaving") : t("screens:admin.memberSave")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {wsOpen && (
        <div className="bb-modal-overlay" onClick={() => !wsBusy && setWsOpen(false)}>
          <div className="bibo-dlg bibo-dlg--org" onClick={(e) => e.stopPropagation()}>
            <div className="bibo-dlg__head">
              <div className="bibo-dlg__icon">{isFamily ? <IconHome /> : <IconTeam />}</div>
              <div className="bibo-dlg__title">{newWorkspaceLabel}</div>
              <button type="button" className="bibo-dlg__close" aria-label={t("screens:admin.cancel")} onClick={() => setWsOpen(false)}>
                <IconX />
              </button>
            </div>
            <form onSubmit={submitWorkspace}>
              <div className="bibo-dlg__body">
                {wsError && <div className="auth-err" role="alert">{wsError}</div>}
                <label className="bibo-field">
                  <span className="bibo-field__lbl">{wsNameLabel}</span>
                  <span className="bibo-input">
                    <input type="text" value={wsName} onChange={(e) => setWsName(e.target.value)} placeholder={wsPlaceholder} autoFocus />
                  </span>
                </label>
              </div>
              <div className="bibo-dlg__foot">
                <button type="button" className="bibo-btn bibo-btn--ghost" onClick={() => setWsOpen(false)} disabled={wsBusy}>
                  {t("screens:admin.cancel")}
                </button>
                <button type="submit" className="bibo-btn bibo-btn--primary" disabled={wsBusy}>
                  {wsBusy ? t("screens:admin.creating") : t("screens:admin.create")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
