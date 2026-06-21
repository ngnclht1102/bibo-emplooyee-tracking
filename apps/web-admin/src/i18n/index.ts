import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enCommon from "./locales/en/common.json";
import enAuth from "./locales/en/auth.json";
import enSignup from "./locales/en/signup.json";
import enDashboard from "./locales/en/dashboard.json";
import enSettings from "./locales/en/settings.json";
import enUi from "./locales/en/ui.json";
import enReports from "./locales/en/reports.json";

import zhCommon from "./locales/zh/common.json";
import zhAuth from "./locales/zh/auth.json";
import zhSignup from "./locales/zh/signup.json";
import zhDashboard from "./locales/zh/dashboard.json";
import zhSettings from "./locales/zh/settings.json";
import zhUi from "./locales/zh/ui.json";
import zhReports from "./locales/zh/reports.json";

import jaCommon from "./locales/ja/common.json";
import jaAuth from "./locales/ja/auth.json";
import jaSignup from "./locales/ja/signup.json";
import jaDashboard from "./locales/ja/dashboard.json";
import jaSettings from "./locales/ja/settings.json";
import jaUi from "./locales/ja/ui.json";
import jaReports from "./locales/ja/reports.json";

import viCommon from "./locales/vi/common.json";
import viAuth from "./locales/vi/auth.json";
import viSignup from "./locales/vi/signup.json";
import viDashboard from "./locales/vi/dashboard.json";
import viSettings from "./locales/vi/settings.json";
import viUi from "./locales/vi/ui.json";
import viReports from "./locales/vi/reports.json";

import idCommon from "./locales/id/common.json";
import idAuth from "./locales/id/auth.json";
import idSignup from "./locales/id/signup.json";
import idDashboard from "./locales/id/dashboard.json";
import idSettings from "./locales/id/settings.json";
import idUi from "./locales/id/ui.json";
import idReports from "./locales/id/reports.json";

import frCommon from "./locales/fr/common.json";
import frAuth from "./locales/fr/auth.json";
import frSignup from "./locales/fr/signup.json";
import frDashboard from "./locales/fr/dashboard.json";
import frSettings from "./locales/fr/settings.json";
import frUi from "./locales/fr/ui.json";
import frReports from "./locales/fr/reports.json";

import esCommon from "./locales/es/common.json";
import esAuth from "./locales/es/auth.json";
import esSignup from "./locales/es/signup.json";
import esDashboard from "./locales/es/dashboard.json";
import esSettings from "./locales/es/settings.json";
import esUi from "./locales/es/ui.json";
import esReports from "./locales/es/reports.json";

/** Supported locales (en is the source of truth). `zh` = Simplified Chinese. */
export const LOCALES = [
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "zh", label: "中文", flag: "🇨🇳" },
  { code: "ja", label: "日本語", flag: "🇯🇵" },
  { code: "vi", label: "Tiếng Việt", flag: "🇻🇳" },
  { code: "id", label: "Bahasa Indonesia", flag: "🇮🇩" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "es", label: "Español", flag: "🇪🇸" },
] as const;

export type LocaleCode = (typeof LOCALES)[number]["code"];

const resources = {
  en: { common: enCommon, auth: enAuth, signup: enSignup, dashboard: enDashboard, settings: enSettings, ui: enUi, reports: enReports },
  zh: { common: zhCommon, auth: zhAuth, signup: zhSignup, dashboard: zhDashboard, settings: zhSettings, ui: zhUi, reports: zhReports },
  ja: { common: jaCommon, auth: jaAuth, signup: jaSignup, dashboard: jaDashboard, settings: jaSettings, ui: jaUi, reports: jaReports },
  vi: { common: viCommon, auth: viAuth, signup: viSignup, dashboard: viDashboard, settings: viSettings, ui: viUi, reports: viReports },
  id: { common: idCommon, auth: idAuth, signup: idSignup, dashboard: idDashboard, settings: idSettings, ui: idUi, reports: idReports },
  fr: { common: frCommon, auth: frAuth, signup: frSignup, dashboard: frDashboard, settings: frSettings, ui: frUi, reports: frReports },
  es: { common: esCommon, auth: esAuth, signup: esSignup, dashboard: esDashboard, settings: esSettings, ui: esUi, reports: esReports },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    supportedLngs: LOCALES.map((l) => l.code),
    // Browser sends e.g. "fr-FR" / "zh-CN"; collapse to the base language.
    load: "languageOnly",
    nonExplicitSupportedLngs: true,
    ns: ["common", "auth", "signup", "dashboard", "settings", "ui", "reports"],
    defaultNS: "common",
    interpolation: { escapeValue: false },
    detection: {
      // Saved choice first, then the browser/OS language.
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "locale",
      caches: ["localStorage"],
    },
  });

/** The active locale, suitable for Intl APIs. */
export function activeLocale(): string {
  return i18n.resolvedLanguage || i18n.language || "en";
}

export default i18n;
