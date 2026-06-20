import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { createBusiness, createEmployee, register } from "../api/endpoints";
import { ApiError, type AccountType } from "../api/types";
import { useAuth } from "./AuthContext";
import { Field, Notice, ProgressRail, StepDots, SuccessBurst, type RailStep } from "../components/ui";
import { memberTerms } from "../terms";
import { AuthLayout } from "./AuthLayout";

const DOWNLOAD_URL = import.meta.env.VITE_DOWNLOAD_URL || "/";

type Step = "persona" | "personal" | "account" | "setup" | "members" | "done";

// Persona → business kind + the word for the org being created.
const NOUN: Record<AccountType, string> = { manager: "team", parent: "family" };
const kindOf = (p: AccountType) => (p === "parent" ? "family" : "team");

// `login` is the identifier the member signs in with — an email or a username.
type AddedMember = { display_name: string; login: string; password: string };

// Simple default temp password, pre-filled for quick setup. The owner can hit
// "↻ New" to swap it for a strong random one (genTempPassword).
const DEFAULT_TEMP_PASSWORD = "12345678";

// orgSlug turns "Yojee Corp" into "yojeecorp" for generated usernames.
function orgSlug(orgName: string): string {
  return orgName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "team";
}

// suggestUsername builds e.g. "yojeecorp_emp1" / "namfamily_kid2".
function suggestUsername(orgName: string, abbrev: string, n: number): string {
  return `${orgSlug(orgName)}_${abbrev}${n}`;
}

// Readable temp password (no ambiguous chars) the owner hands to the new member.
function genTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// Rail step numbers (1-based) for each wizard step.
const RAIL_INDEX: Record<Exclude<Step, "persona" | "personal">, number> = {
  account: 2,
  setup: 3,
  members: 4,
  done: 5,
};

export function SignupWizard() {
  const { t } = useTranslation("signup");
  const nav = useNavigate();
  const { setSession } = useAuth();

  const [step, setStep] = useState<Step>("persona");
  const [persona, setPersona] = useState<AccountType>("manager");

  const [displayName, setDisplayName] = useState("");
  const [login, setLogin] = useState(""); // owner's email or username
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [bizId, setBizId] = useState<string | null>(null);
  const [members, setMembers] = useState<AddedMember[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const noun = NOUN[persona];
  const terms = memberTerms(kindOf(persona));

  const railSteps: RailStep[] = [
    { title: t("rail.personaTitle"), description: t("rail.personaDesc") },
    { title: t("rail.accountTitle"), description: t("rail.accountDesc") },
    { title: t("rail.setupTitle", { noun }), description: t("rail.setupDesc", { noun }) },
    {
      title: t("rail.membersTitleManager", { members: terms.lowerMany }),
      description: persona === "parent" ? t("rail.membersDescParent") : t("rail.membersDescManager"),
    },
    { title: t("rail.doneTitle"), description: t("rail.doneDesc") },
  ];

  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await register(login.trim(), password, displayName.trim(), persona);
      setSession(res.user);
      setStep("setup");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("errors.server"));
    } finally {
      setBusy(false);
    }
  }

  async function finishSetup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const biz = await createBusiness(orgName.trim());
      setBizId(biz.id);
      setStep("members");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("errors.server"));
    } finally {
      setBusy(false);
    }
  }

  // ---- Step "persona" (W2): full-width card ----
  if (step === "persona") {
    return (
      <AuthLayout
        wide
        footer={
          <>
            {t("footer.haveAccount")} <Link to="/login">{t("footer.signIn")}</Link>
          </>
        }
      >
        <div className="row spread" style={{ marginBottom: 16 }}>
          <h1 style={{ margin: 0 }}>{t("persona.heading")}</h1>
          <StepDots total={5} current={1} />
        </div>
        <div className="persona-grid">
          <button type="button" className="persona-card" onClick={() => setStep("personal")}>
            <span className="emoji" aria-hidden>🧍</span>
            <span className="p-title">{t("persona.justMeTitle")}</span>
            <span className="p-desc">
              {t("persona.justMeDesc")}
            </span>
            <span className="p-tag">{t("persona.justMeTag")}</span>
          </button>
          <button
            type="button"
            className="persona-card"
            onClick={() => {
              setPersona("manager");
              setStep("account");
            }}
          >
            <span className="emoji" aria-hidden>👥</span>
            <span className="p-title">{t("persona.teamTitle")}</span>
            <span className="p-desc">{t("persona.teamDesc")}</span>
            <span className="p-tag">{t("persona.teamTag")}</span>
          </button>
          <button
            type="button"
            className="persona-card"
            onClick={() => {
              setPersona("parent");
              setStep("account");
            }}
          >
            <span className="emoji" aria-hidden>👨‍👩‍👧</span>
            <span className="p-title">{t("persona.familyTitle")}</span>
            <span className="p-desc">{t("persona.familyDesc")}</span>
            <span className="p-tag">{t("persona.familyTag")}</span>
          </button>
        </div>
        <div className="caption" style={{ marginTop: 16 }}>
          {t("persona.caption")}
        </div>
      </AuthLayout>
    );
  }

  // ---- Personal branch (W3): no account, no rail ----
  if (step === "personal") {
    return (
      <AuthLayout>
        <button className="link-row back-top" onClick={() => setStep("persona")}>
          {t("personal.back")}
        </button>
        <h1>
          <span aria-hidden>🧍 </span>{t("personal.heading")}
        </h1>
        <div className="auth-sub">
          {t("personal.sub")}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <a className="btn btn-primary" href={DOWNLOAD_URL}>{t("personal.downloadMac")}</a>
          <a className="btn" href={DOWNLOAD_URL}>{t("personal.downloadWindows")}</a>
        </div>
        <div className="caption" style={{ marginTop: 16 }}>
          {t("personal.caption")}
        </div>
      </AuthLayout>
    );
  }

  // ---- Split steps (account / setup / members / done) share the rail layout ----
  const current = RAIL_INDEX[step];
  const railFooter =
    step === "account" ? (
      <>
        {t("footer.haveOne")} <Link to="/login">{t("footer.signIn")}</Link>
      </>
    ) : undefined;

  return (
    <AuthLayout bare footer={railFooter}>
      <div className="welcome-split">
        <div className="welcome-main">
          <div className="show-narrow" style={{ marginBottom: 16 }}>
            <StepDots total={5} current={current} />
          </div>

          {step === "account" && (
            <form onSubmit={createAccount}>
              <button type="button" className="link-row back-top" onClick={() => setStep("persona")}>
                {t("account.back")}
              </button>
              <h1 style={{ marginTop: 0 }}>{t("account.title")}</h1>
              <div className="auth-sub">{t("account.sub")}</div>
              {error && (
                <div style={{ marginBottom: 12 }}>
                  <Notice kind="danger">{error}</Notice>
                </div>
              )}
              <Field label={t("account.name")}>
                <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required autoComplete="name" />
              </Field>
              <Field label={t("account.identifier")}>
                <input className="input" type="text" value={login} onChange={(e) => setLogin(e.target.value)} required autoComplete="username" placeholder={t("account.identifierPlaceholder")} />
              </Field>
              <Field label={t("account.password")}>
                <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" placeholder={t("account.passwordPlaceholder")} />
              </Field>
              <button className="btn btn-primary btn-block" style={{ marginTop: 8 }} disabled={busy}>
                {busy ? t("account.creating") : t("account.continue")}
              </button>
            </form>
          )}

          {step === "setup" && (
            <form onSubmit={finishSetup}>
              <h1 style={{ marginTop: 0 }}>{t("setup.title", { noun })}</h1>
              <div className="auth-sub">{t("setup.sub", { members: terms.lowerMany })}</div>
              {error && (
                <div style={{ marginBottom: 12 }}>
                  <Notice kind="danger">{error}</Notice>
                </div>
              )}
              <Field label={t("setup.nameLabel", { noun: noun[0].toUpperCase() + noun.slice(1) })}>
                <input className="input" value={orgName} onChange={(e) => setOrgName(e.target.value)} required placeholder={persona === "parent" ? t("setup.placeholderFamily") : t("setup.placeholderTeam")} autoFocus />
              </Field>
              <button className="btn btn-primary btn-block" style={{ marginTop: 8 }} disabled={busy}>
                {busy ? t("setup.saving") : t("setup.continue")}
              </button>
            </form>
          )}

          {step === "members" && (
            <AddMembers
              businessId={bizId}
              orgName={orgName}
              terms={terms}
              members={members}
              onAdded={(m) => setMembers((cur) => [...cur, m])}
              onRemoveVisual={(i) => setMembers((cur) => cur.filter((_, idx) => idx !== i))}
              onFinish={() => setStep("done")}
            />
          )}

          {step === "done" && (
            <>
              <SuccessBurst
                title={t("done.title")}
                items={[
                  { label: t("done.accountCreated"), done: true },
                  { label: t("done.orgReady", { noun: noun[0].toUpperCase() + noun.slice(1) }), done: true },
                  {
                    label:
                      members.length > 0
                        ? t("done.membersAdded", {
                            count: members.length,
                            members: members.length === 1 ? terms.lowerOne : terms.lowerMany,
                          })
                        : t("done.membersLater", { members: terms.lowerMany }),
                    done: members.length > 0,
                  },
                ]}
              />
              <button className="btn btn-primary btn-block" onClick={() => nav("/", { replace: true })}>
                {t("done.goToDashboard")}
              </button>
            </>
          )}
        </div>

        <aside className="rail-panel">
          <ProgressRail steps={railSteps} current={current} />
        </aside>
      </div>
    </AuthLayout>
  );
}

// AddMembers — inline add-employees/add-kids step. Each "Add" creates a real
// account via createEmployee against the just-created business.
function AddMembers({
  businessId,
  orgName,
  terms,
  members,
  onAdded,
  onRemoveVisual,
  onFinish,
}: {
  businessId: string | null;
  orgName: string;
  terms: ReturnType<typeof memberTerms>;
  members: AddedMember[];
  onAdded: (m: AddedMember) => void;
  onRemoveVisual: (index: number) => void;
  onFinish: () => void;
}) {
  const { t } = useTranslation("signup");
  const [name, setName] = useState("");
  const [login, setLogin] = useState(() => suggestUsername(orgName, terms.idAbbrev, members.length + 1));
  const [password, setPassword] = useState(DEFAULT_TEMP_PASSWORD);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const value = login.trim();
    const isEmail = value.includes("@");
    try {
      await createEmployee({
        email: isEmail ? value : undefined,
        username: isEmail ? undefined : value.toLowerCase(),
        password,
        display_name: name.trim(),
        business_id: businessId ?? undefined,
      });
      onAdded({ display_name: name.trim(), login: isEmail ? value : value.toLowerCase(), password });
      // Reset for the next person: fresh suggested username + default password.
      setName("");
      setLogin(suggestUsername(orgName, terms.idAbbrev, members.length + 2));
      setPassword(DEFAULT_TEMP_PASSWORD);
      nameRef.current?.focus();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.status === 409 ? t("errors.taken") : err.message);
      } else {
        setError(t("errors.addMember", { member: terms.lowerOne }));
      }
    } finally {
      setBusy(false);
    }
  }

  async function copyLogin(m: AddedMember, i: number) {
    const text = t("clipboard.text", { login: m.login, password: m.password });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(i);
      window.setTimeout(() => setCopied((c) => (c === i ? null : c)), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>{t("members.title", { members: terms.lowerMany })}</h1>
      <div className="auth-sub">
        {t("members.sub", { member: terms.lowerOne })}
      </div>

      {error && (
        <div style={{ marginBottom: 12 }}>
          <Notice kind="danger">{error}</Notice>
        </div>
      )}

      <form onSubmit={add} className="member-form">
        <div className="member-grid">
          <Field label={t("members.name")}>
            <input className="input" ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} required placeholder={t("members.namePlaceholder")} autoFocus />
          </Field>
          <Field label={t("members.loginLabel")}>
            <input className="input" value={login} onChange={(e) => setLogin(e.target.value)} required placeholder={`${orgSlug(orgName)}_${terms.idAbbrev}1`} autoComplete="off" />
          </Field>
        </div>
        <Field label={t("members.tempPassword")}>
          <div className="input-affix">
            <input className="input" type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            <button type="button" className="affix-btn" title={t("members.generateTitle")} onClick={() => setPassword(genTempPassword())}>
              {t("members.newPassword")}
            </button>
          </div>
        </Field>
        <button className="btn btn-block" disabled={busy}>
          {busy ? t("members.adding") : t("members.addCta", { cta: terms.addCta })}
        </button>
      </form>

      {members.length > 0 && (
        <>
          <div className="member-count">
            {t("members.countAdded", {
              count: members.length,
              members: members.length === 1 ? terms.lowerOne : terms.lowerMany,
            })}
          </div>
          <div className="set-group" style={{ marginTop: 8 }}>
            {members.map((m, i) => (
              <div className="set-row member-row" key={`${m.login}-${i}`}>
                <div className="member-info">
                  <div className="set-title">✓ {m.display_name}</div>
                  <div className="member-creds">
                    <span>{m.login}</span>
                    <span className="cred-pass">{m.password}</span>
                  </div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button type="button" className="btn" onClick={() => copyLogin(m, i)}>
                    {copied === i ? t("members.copied") : t("members.copyLogin")}
                  </button>
                  <button type="button" className="link-row" onClick={() => onRemoveVisual(i)}>
                    {t("members.remove")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="onb-actions" style={{ marginTop: 20 }}>
        <button type="button" className="btn btn-primary btn-block" onClick={onFinish}>
          {t("members.finish")}
        </button>
        <button type="button" className="link-row onb-skip" onClick={onFinish}>
          {members.length > 0 ? t("members.doneAdding") : t("members.skip")}
        </button>
      </div>
    </div>
  );
}
