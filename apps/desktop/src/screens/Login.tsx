import { useState } from "react";
import { call as invoke } from "../api";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { BrandLogo } from "../ui";
import { LanguageSwitcher } from "../components/LanguageSwitcher";

export type Session = {
  email: string;
  business_id?: string | null;
};

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

  async function openSignup() {
    try {
      const url = await invoke<string>("signup_url");
      await openUrl(url);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="login welcome">
      <div className="welcome-lang">
        <LanguageSwitcher />
      </div>
      <BrandLogo />
      <form className="login-card" onSubmit={signIn}>
        {onBack && (
          <button type="button" className="link-row back-top" onClick={onBack}>
            {t("login.back")}
          </button>
        )}
        <h1 className="login-title">{t("login.title")}</h1>
        <p className="login-sub">{t("login.subtitle")}</p>

        <div className="field">
          <label>{t("login.identifier")}</label>
          <input
            className="input"
            type="text"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        </div>
        <div className="field">
          <label>{t("login.password")}</label>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <div className="login-error">{error}</div>}

        <button
          className="btn btn-primary btn-block"
          type="submit"
          disabled={busy || !email.trim() || !password}
        >
          {busy ? t("login.submitting") : t("login.submit")}
        </button>

        <div className="caption" style={{ marginTop: 14, textAlign: "center" }}>
          {t("login.noAccount")}{" "}
          <button type="button" className="signout login-signup-link" onClick={openSignup}>
            {t("login.signupLink")}
          </button>
        </div>
      </form>
    </div>
  );
}
