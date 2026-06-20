import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { login } from "../api/endpoints";
import { ApiError } from "../api/types";
import { useAuth } from "./AuthContext";
import { Field, Notice } from "../components/ui";
import { AuthLayout } from "./AuthLayout";

const DOWNLOAD_URL = import.meta.env.VITE_DOWNLOAD_URL || "/";

export function SignIn() {
  const nav = useNavigate();
  const { t } = useTranslation("auth");
  const { setSession } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await login(identifier.trim(), password);
      setSession(res.user);
      nav("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError(t("errors.network"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      footer={
        <>
          {t("signIn.localFooter")} <a href={DOWNLOAD_URL}>{t("signIn.download")}</a>
        </>
      }
    >
      <form onSubmit={submit}>
        <h1>{t("signIn.title")}</h1>
        <div className="auth-sub">{t("signIn.subtitle")}</div>

        {error && (
          <div style={{ marginBottom: 12 }}>
            <Notice kind="danger">{error}</Notice>
          </div>
        )}

        <Field label={t("signIn.identifier")}>
          <input
            className="input"
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            autoComplete="username"
          />
        </Field>
        <Field label={t("signIn.password")}>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </Field>

        <button className="btn btn-primary btn-block" style={{ marginTop: 8 }} disabled={busy}>
          {busy ? t("signIn.submitting") : t("signIn.submit")}
        </button>

        <div className="caption" style={{ marginTop: 16, textAlign: "center" }}>
          {t("signIn.newHere")} <Link to="/signup">{t("signIn.createAccount")}</Link>
        </div>
      </form>
    </AuthLayout>
  );
}
