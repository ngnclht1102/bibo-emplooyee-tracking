import { useState } from "react";
import { call as invoke } from "../api";
import { useTranslation } from "react-i18next";
import { BrandMark } from "../ui";
import { AuthTitleBar } from "../components/AuthTitleBar";
import { LanguageSwitcher } from "../components/LanguageSwitcher";

export type Session = {
  email: string;
  business_id?: string | null;
};

/* Inline icons (no icon dependency — matches the inline-mark style used elsewhere). */
const AtSignIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="4" />
    <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
  </svg>
);
const LockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const AlertIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);
const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m12 19-7-7 7-7" />
    <path d="M19 12H5" />
  </svg>
);

/// Shown when the user picks "I have an account" on the welcome screen. The
/// employee signs in with their pre-created account — the backend resolves their
/// company from their membership, so there's nothing to pick.
export function Login({
  onLoggedIn,
  onBack,
}: {
  onLoggedIn: (s: Session) => void;
  onBack?: () => void;
}) {
  const { t } = useTranslation("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      // No business_id: the backend resolves the employee's company from their
      // single membership.
      const session = await invoke<Session>("login", {
        email: email.trim(),
        password,
        businessId: null,
      });
      onLoggedIn(session);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login welcome">
      <AuthTitleBar />
      {onBack && (
        <button type="button" className="welcome-back" onClick={onBack}>
          <BackIcon />
          {t("login.back")}
        </button>
      )}
      <div className="welcome-lang">
        <LanguageSwitcher compact />
      </div>

      <BrandMark />
      <form className="login-card" onSubmit={signIn}>
        <h1 className="login-title">{t("login.title")}</h1>
        <p className="login-sub">{t("login.subtitle")}</p>

        <div className="auth-form">
          {error && (
            <div className="auth-err" role="alert">
              <AlertIcon />
              {error}
            </div>
          )}

          <label className="auth-field">
            <span className="auth-field-lbl">{t("login.identifier")}</span>
            <div className="auth-input">
              <span className="auth-input-ic">
                <AtSignIcon />
              </span>
              <input
                type="text"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
              />
            </div>
          </label>

          <label className="auth-field">
            <span className="auth-field-lbl">{t("login.password")}</span>
            <div className="auth-input">
              <span className="auth-input-ic">
                <LockIcon />
              </span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </label>

          <div className="auth-forgot-row">
            <button type="button" className="auth-link" onClick={() => {}}>
              {t("login.forgot")}
            </button>
          </div>

          <button
            className="auth-btn"
            type="submit"
            disabled={busy}
          >
            {busy ? t("login.submitting") : t("login.submit")}
          </button>

          <p className="auth-foot-link">
            {t("login.noAccount")}{" "}
            <button type="button" className="auth-signup" onClick={() => {}}>
              {t("login.signupLink")}
            </button>
          </p>
        </div>
      </form>
    </div>
  );
}
