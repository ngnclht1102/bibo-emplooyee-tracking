import { useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { call as invoke } from "../../api";

export type AdminUser = {
  email: string;
  username: string;
  display_name: string;
  account_type: string;
};
export type AdminLoginResult = { access_token: string; user: AdminUser };

/* Inline icons — same inline-mark style as the tracker Login screen. */
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

// Native owner sign-in for the Admin section — styled with the app's own auth
// primitives (.login-card / .auth-*). Authenticates via the `admin_login` command,
// which keeps the token out of the tracker's session (see commands/mod.rs).
export function AdminLogin({ onSignedIn }: { onSignedIn: (r: AdminLoginResult) => void }) {
  const { t } = useTranslation();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const r = await invoke<AdminLoginResult>("admin_login", {
        identifier: identifier.trim(),
        password,
      });
      onSignedIn(r);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  // Open the web signup wizard in the system browser.
  async function openSignup() {
    try {
      await openUrl(await invoke<string>("signup_url"));
    } catch {
      /* ignore — the user can still sign in */
    }
  }

  // Open the product/admin site in the system browser. Use the `/admin/` base
  // (with trailing slash) so the web-admin dev server doesn't reject a bare-origin
  // path with its "did you mean /admin/" base-URL notice.
  async function openDownload() {
    try {
      const u = await invoke<string>("admin_url"); // already ends in /admin/
      await openUrl(u);
    } catch {
      /* ignore */
    }
  }

  // `welcome` scopes the app's auth form styles (.auth-*) and, like the tracker's
  // own sign-in, keeps this surface light regardless of the OS/app theme.
  return (
    <div className="bb-adminlogin welcome">
      <form className="login-card" onSubmit={submit}>
        <span className="bb-adminlogin__logo" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M4.5 12 h3.2 l1.8 -4.4 l2.4 8.8 l1.8 -4.4 h4.5" />
          </svg>
        </span>
        <h1 className="login-title">{t("screens:admin.title")}</h1>
        <p className="login-sub">{t("screens:admin.subtitle")}</p>

        <div className="auth-form">
          {error && (
            <div className="auth-err" role="alert">
              <AlertIcon />
              {error}
            </div>
          )}

          <label className="auth-field">
            <span className="auth-field-lbl">{t("auth:login.identifier")}</span>
            <div className="auth-input">
              <span className="auth-input-ic"><AtSignIcon /></span>
              <input
                type="text"
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="you@example.com"
                autoFocus
              />
            </div>
          </label>

          <label className="auth-field">
            <span className="auth-field-lbl">{t("auth:login.password")}</span>
            <div className="auth-input">
              <span className="auth-input-ic"><LockIcon /></span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </label>

          <button className="auth-btn" type="submit" disabled={busy}>
            {busy ? t("auth:login.submitting") : t("auth:login.submit")}
          </button>

          <div className="bb-adminlogin__links">
            <span className="bb-adminlogin__muted">
              {t("screens:admin.newHere")}{" "}
              <button type="button" className="bb-adminlogin__link" onClick={openSignup}>
                {t("screens:admin.createAccount")}
              </button>
            </span>
            <button type="button" className="bb-adminlogin__link" onClick={openDownload}>
              {t("screens:admin.download")}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
