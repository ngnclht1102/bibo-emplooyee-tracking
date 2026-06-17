import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login, register } from "../api/endpoints";
import { ApiError } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Field, Notice } from "../components/ui";

type Tab = "login" | "register";

export function Login() {
  const nav = useNavigate();
  const { setSession } = useAuth();
  const [tab, setTab] = useState<Tab>("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res =
        tab === "login"
          ? await login(email.trim(), password)
          : await register(email.trim(), password, displayName.trim());
      setSession(res.user);
      nav("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Could not reach the server. Is the backend running?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <h1>BiBoEmployeeTracking admin</h1>
        <div className="auth-sub">Owner dashboard</div>

        <div className="segmented" style={{ marginBottom: 16, width: "100%" }} role="tablist">
          <button
            type="button"
            className={tab === "login" ? "active" : ""}
            style={{ flex: 1 }}
            onClick={() => {
              setTab("login");
              setError(null);
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            className={tab === "register" ? "active" : ""}
            style={{ flex: 1 }}
            onClick={() => {
              setTab("register");
              setError(null);
            }}
          >
            Create account
          </button>
        </div>

        {error && (
          <div style={{ marginBottom: 12 }}>
            <Notice kind="danger">{error}</Notice>
          </div>
        )}

        {tab === "register" && (
          <Field label="Display name">
            <input
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              autoComplete="name"
            />
          </Field>
        )}

        <Field label="Email">
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </Field>

        <Field label="Password">
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={tab === "login" ? "current-password" : "new-password"}
          />
        </Field>

        <button className="btn btn-primary" style={{ width: "100%", marginTop: 8 }} disabled={busy}>
          {busy ? "Working…" : tab === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
    </div>
  );
}
