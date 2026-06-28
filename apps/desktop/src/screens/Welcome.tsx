import { call as invoke } from "../api";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { BrandMark } from "../ui";
import { AuthTitleBar } from "../components/AuthTitleBar";
import { LanguageSwitcher } from "../components/LanguageSwitcher";

/** Right-pointing arrow used inside the persona-card action links. */
function Arrow() {
  return (
    <svg
      className="p-arrow"
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

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
      <AuthTitleBar />
      <div className="welcome-lang">
        <LanguageSwitcher compact />
      </div>
      <BrandMark />
      <div className="login-card">
        <h1 className="login-title">{t("welcome.title")}</h1>
        <p className="login-sub">{t("welcome.sub")}</p>

        <div className="persona-grid">
          <button type="button" className="persona-card focal" onClick={onUseLocally}>
            <span className="p-icon" aria-hidden>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
              </svg>
            </span>
            <span className="p-title">{t("welcome.local.title")}</span>
            <span className="p-desc">{t("welcome.local.desc")}</span>
            <span className="p-action">
              {t("welcome.local.next")} <Arrow />
            </span>
          </button>

          <button type="button" className="persona-card" onClick={onSignIn}>
            <span className="p-icon" aria-hidden>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="9" cy="8" r="3.2" />
                <path d="M2.5 20c0-3.3 3-5 6.5-5s6.5 1.7 6.5 5" />
                <path d="M16 5.2a3.2 3.2 0 0 1 0 6" />
                <path d="M17 15.5c2.6.4 4.5 2 4.5 4.5" />
              </svg>
            </span>
            <span className="p-title">{t("welcome.account.title")}</span>
            <span className="p-desc">{t("welcome.account.desc")}</span>
            <span className="p-action">
              {t("welcome.account.signIn")} <Arrow />
            </span>
          </button>
        </div>

        <div className="welcome-foot">
          {t("welcome.needAccount")}{" "}
          <button className="signup" onClick={openSignup}>
            {t("welcome.signupLink")}
          </button>
        </div>
      </div>
    </div>
  );
}
