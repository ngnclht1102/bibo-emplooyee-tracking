import { useState } from "react";

/// First-run consent (Windows). Windows has no per-feature OS permission prompts,
/// so the app asks for informed consent before any capture starts (see docs/12 §3 E).
/// Until the user consents, the backend keeps screenshots + keystroke counting off.
export function Consent({ onConsent }: { onConsent: () => void }) {
  const [busy, setBusy] = useState(false);
  const accept = () => {
    setBusy(true);
    onConsent();
  };

  return (
    <div className="login">
      <div className="login-card" style={{ maxWidth: 520 }}>
        <div className="brand" style={{ marginBottom: 8 }}>
          BiBoEmployeeTracking
        </div>
        <h2 style={{ margin: "4px 0 12px" }}>Before you start</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          This app records work activity on this computer so it can be shown to your
          employer. While running, it captures:
        </p>
        <ul className="muted" style={{ lineHeight: 1.7, paddingLeft: 18 }}>
          <li>The active app and window title</li>
          <li>Keystroke <strong>counts</strong> — never which keys you press</li>
          <li>Periodic screenshots of your screen(s)</li>
          <li>Pages visited in your browser (via the extension)</li>
        </ul>
        <p className="muted">
          You can turn off screenshots or keystroke counting anytime in{" "}
          <strong>Settings</strong>, and pause tracking from the tray icon.
        </p>
        <button
          className="btn btn-primary"
          style={{ width: "100%", marginTop: 8 }}
          onClick={accept}
          disabled={busy}
        >
          {busy ? "Starting…" : "I understand and consent"}
        </button>
      </div>
    </div>
  );
}
