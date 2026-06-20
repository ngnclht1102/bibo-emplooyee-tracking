import { useTranslation } from "react-i18next";
import { LOCALES } from "../i18n";

/**
 * LanguageSwitcher — a compact <select> for the active locale. The choice is
 * persisted to localStorage by i18next's language detector (key: "locale").
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { i18n, t } = useTranslation();
  const current = LOCALES.find((l) => l.code === i18n.resolvedLanguage)?.code ?? "en";

  return (
    <select
      className={`lang-switcher ${className ?? ""}`}
      value={current}
      onChange={(e) => i18n.changeLanguage(e.target.value)}
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
