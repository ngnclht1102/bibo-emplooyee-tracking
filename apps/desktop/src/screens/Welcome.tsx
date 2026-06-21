import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { BrandLogo } from "../ui";
import { LanguageSwitcher } from "../components/LanguageSwitcher";

/**
 * Welcome — first launch, no session yet. Branches the user into either a fully
 * local "Just me" mode (no account) or signing in with a team/family account. A
 * link opens the web signup wizard in the system browser.
 */
export function Welcome({
  onUseLocally,
  onSignIn,
}: {
  onUseLocally: () => void;
  onSignIn: () => void;
}) {
  const { t } = useTranslation("welcome");
  async function openSignup() {
    try {
      const url = await invoke<string>("signup_url");
      await openUrl(url);
    } catch {
      /* ignore — user can still sign in or use locally */
    }
  }

  return (
    <div className="login welcome">
      <div className="welcome-lang">
        <LanguageSwitcher />
      </div>
      <BrandLogo />
      <div className="login-card">
        <h1 className="login-title">{t("welcome.title")}</h1>
        <p className="login-sub">{t("welcome.sub")}</p>

        <div className="persona-grid">
          <button type="button" className="persona-card" onClick={onUseLocally}>
            <span className="emoji" aria-hidden>
              🧍
            </span>
            <span className="p-title">{t("welcome.local.title")}</span>
            <span className="p-desc">{t("welcome.local.desc")}</span>
          </button>

          <button type="button" className="persona-card" onClick={onSignIn}>
            <span className="emoji" aria-hidden>
              👥
            </span>
            <span className="p-title">{t("welcome.account.title")}</span>
            <span className="p-desc">{t("welcome.account.desc")}</span>
          </button>
        </div>

        <div className="caption" style={{ marginTop: 16, textAlign: "center" }}>
          {t("welcome.needAccount")}{" "}
          <button className="signout" onClick={openSignup}>
            {t("welcome.signupLink")}
          </button>
        </div>
      </div>
    </div>
  );
}
