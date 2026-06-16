import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type Session = {
  email: string;
  business_id?: string | null;
};

type PublicBusiness = {
  business_id: string;
  name: string;
  owner_name: string;
};

/// Shown on launch whenever there's no valid session. Employees "find their
/// company/owner" in the list, then sign in with their pre-created account.
export function Login({ onLoggedIn }: { onLoggedIn: (s: Session) => void }) {
  const [businesses, setBusinesses] = useState<PublicBusiness[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadBusinesses();
  }, []);

  function loadBusinesses() {
    setLoadError(null);
    invoke<PublicBusiness[]>("list_businesses")
      .then(setBusinesses)
      .catch((e) => setLoadError(String(e)));
  }

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return businesses;
    return businesses.filter(
      (b) =>
        b.name.toLowerCase().includes(q) || b.owner_name.toLowerCase().includes(q),
    );
  }, [businesses, filter]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const session = await invoke<Session>("login", {
        email: email.trim(),
        password,
        businessId: selected ?? null,
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
        <p className="login-sub">Find your company, then sign in with your account.</p>

        <div className="field">
          <label>Company</label>
          <input
            className="input"
            placeholder="Search company or owner…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        {loadError ? (
          <div className="login-error">
            Couldn’t load companies: {loadError}{" "}
            <button type="button" className="signout" onClick={loadBusinesses}>
              Retry
            </button>
          </div>
        ) : (
          <div className="biz-list">
            {shown.length === 0 ? (
              <div className="biz-item muted">No companies found</div>
            ) : (
              shown.map((b) => (
                <div
                  key={b.business_id}
                  className={`biz-item ${selected === b.business_id ? "active" : ""}`}
                  onClick={() =>
                    setSelected(selected === b.business_id ? null : b.business_id)
                  }
                >
                  {b.name} <span className="owner">· {b.owner_name}</span>
                </div>
              ))
            )}
          </div>
        )}

        <div className="field">
          <label>Email</label>
          <input
            className="input"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
