import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { LOCALES } from "../i18n";

/**
 * LanguageSwitcher — compact <select> for the active locale. Persisted to the
 * webview's localStorage by i18next's detector (key: "locale"), and mirrored to
 * the Rust side (settings.locale) so the native tray follows the same language.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { i18n, t } = useTranslation();
  const current = LOCALES.find((l) => l.code === i18n.resolvedLanguage)?.code ?? "en";

  function change(locale: string) {
    i18n.changeLanguage(locale);
    // Mirror to native settings so the tray menu/tooltip localize too (best-effort).
    invoke("set_locale", { locale }).catch(() => {});
  }

  return (
    <select
      className={`lang-switcher ${className ?? ""}`}
      value={current}
      onChange={(e) => change(e.target.value)}
      aria-label={t("language")}
      title={t("language")}
    >
      {LOCALES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.label}
        </option>
      ))}
    </select>
  );
}
