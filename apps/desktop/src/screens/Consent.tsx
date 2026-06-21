import { useState } from "react";
import { useTranslation } from "react-i18next";

/// First-run consent (Windows). Windows has no per-feature OS permission prompts,
/// so the app asks for informed consent before any capture starts (see docs/12 §3 E).
/// Until the user consents, the backend keeps screenshots + keystroke counting off.
export function Consent({ onConsent }: { onConsent: () => void }) {
  const { t } = useTranslation("welcome");
  const [busy, setBusy] = useState(false);
  const accept = () => {
    setBusy(true);
    onConsent();
  };

  return (
    <div className="login">
      <div className="login-card" style={{ maxWidth: 520 }}>
        <div className="brand" style={{ marginBottom: 8 }}>
          BiBoTracking
        </div>
        <h2 style={{ margin: "4px 0 12px" }}>{t("consent.heading")}</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          {t("consent.body")}
        </p>
        <ul className="muted" style={{ lineHeight: 1.7, paddingLeft: 18 }}>
          <li>{t("consent.item1")}</li>
          <li>
            {t("consent.item2Before")}
            <strong>{t("consent.item2Counts")}</strong>
            {t("consent.item2After")}
          </li>
          <li>{t("consent.item3")}</li>
          <li>{t("consent.item4")}</li>
        </ul>
        <p className="muted">
          {t("consent.optOutBefore")}
          <strong>{t("consent.settings")}</strong>
          {t("consent.optOutAfter")}
        </p>
        <button
          className="btn btn-primary"
          style={{ width: "100%", marginTop: 8 }}
          onClick={accept}
          disabled={busy}
        >
          {busy ? t("consent.starting") : t("consent.accept")}
        </button>
      </div>
    </div>
  );
}
