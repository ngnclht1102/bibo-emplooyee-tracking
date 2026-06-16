import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type Session = {
  email: string;
  business_id?: string | null;
};

/// Shown on launch whenever there's no valid session. The employee just signs in
/// with their pre-created account — the backend resolves their company from their
/// membership, so there's nothing to pick.
export function Login({ onLoggedIn }: { onLoggedIn: (s: Session) => void }) {
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
    <div className="login">
      <form className="login-card" onSubmit={signIn}>
        <h1 className="login-title">Sign in</h1>
        <p className="login-sub">Sign in with the account your company gave you.</p>

        <div className="field">
          <label>Email</label>
          <input
            className="input"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        </div>
        <div className="field">
          <label>Password</label>
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
          className="btn btn-primary"
          type="submit"
          disabled={busy || !email.trim() || !password}
          style={{ width: "100%", justifyContent: "center" }}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
