import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enCommon from "./locales/en/common.json";
import enAuth from "./locales/en/auth.json";
import enOnboarding from "./locales/en/onboarding.json";
import enWelcome from "./locales/en/welcome.json";
import enSettings from "./locales/en/settings.json";
import enPermissions from "./locales/en/permissions.json";
import enScreens from "./locales/en/screens.json";
import enMedia from "./locales/en/media.json";

import zhCommon from "./locales/zh/common.json";
import zhAuth from "./locales/zh/auth.json";
import zhOnboarding from "./locales/zh/onboarding.json";
import zhWelcome from "./locales/zh/welcome.json";
import zhSettings from "./locales/zh/settings.json";
import zhPermissions from "./locales/zh/permissions.json";
import zhScreens from "./locales/zh/screens.json";
import zhMedia from "./locales/zh/media.json";

import jaCommon from "./locales/ja/common.json";
import jaAuth from "./locales/ja/auth.json";
import jaOnboarding from "./locales/ja/onboarding.json";
import jaWelcome from "./locales/ja/welcome.json";
import jaSettings from "./locales/ja/settings.json";
import jaPermissions from "./locales/ja/permissions.json";
import jaScreens from "./locales/ja/screens.json";
import jaMedia from "./locales/ja/media.json";

import viCommon from "./locales/vi/common.json";
import viAuth from "./locales/vi/auth.json";
import viOnboarding from "./locales/vi/onboarding.json";
import viWelcome from "./locales/vi/welcome.json";
import viSettings from "./locales/vi/settings.json";
import viPermissions from "./locales/vi/permissions.json";
import viScreens from "./locales/vi/screens.json";
import viMedia from "./locales/vi/media.json";

import idCommon from "./locales/id/common.json";
import idAuth from "./locales/id/auth.json";
import idOnboarding from "./locales/id/onboarding.json";
import idWelcome from "./locales/id/welcome.json";
import idSettings from "./locales/id/settings.json";
import idPermissions from "./locales/id/permissions.json";
import idScreens from "./locales/id/screens.json";
import idMedia from "./locales/id/media.json";

import frCommon from "./locales/fr/common.json";
import frAuth from "./locales/fr/auth.json";
import frOnboarding from "./locales/fr/onboarding.json";
import frWelcome from "./locales/fr/welcome.json";
import frSettings from "./locales/fr/settings.json";
import frPermissions from "./locales/fr/permissions.json";
import frScreens from "./locales/fr/screens.json";
import frMedia from "./locales/fr/media.json";

import esCommon from "./locales/es/common.json";
import esAuth from "./locales/es/auth.json";
import esOnboarding from "./locales/es/onboarding.json";
import esWelcome from "./locales/es/welcome.json";
import esSettings from "./locales/es/settings.json";
import esPermissions from "./locales/es/permissions.json";
import esScreens from "./locales/es/screens.json";
import esMedia from "./locales/es/media.json";

/** Supported locales (en is the source of truth). `zh` = Simplified Chinese. */
export const LOCALES = [
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "id", label: "Bahasa Indonesia" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
] as const;

export type LocaleCode = (typeof LOCALES)[number]["code"];

const resources = {
  en: { common: enCommon, auth: enAuth, onboarding: enOnboarding, welcome: enWelcome, settings: enSettings, permissions: enPermissions, screens: enScreens, media: enMedia },
  zh: { common: zhCommon, auth: zhAuth, onboarding: zhOnboarding, welcome: zhWelcome, settings: zhSettings, permissions: zhPermissions, screens: zhScreens, media: zhMedia },
  ja: { common: jaCommon, auth: jaAuth, onboarding: jaOnboarding, welcome: jaWelcome, settings: jaSettings, permissions: jaPermissions, screens: jaScreens, media: jaMedia },
  vi: { common: viCommon, auth: viAuth, onboarding: viOnboarding, welcome: viWelcome, settings: viSettings, permissions: viPermissions, screens: viScreens, media: viMedia },
  id: { common: idCommon, auth: idAuth, onboarding: idOnboarding, welcome: idWelcome, settings: idSettings, permissions: idPermissions, screens: idScreens, media: idMedia },
  fr: { common: frCommon, auth: frAuth, onboarding: frOnboarding, welcome: frWelcome, settings: frSettings, permissions: frPermissions, screens: frScreens, media: frMedia },
  es: { common: esCommon, auth: esAuth, onboarding: esOnboarding, welcome: esWelcome, settings: esSettings, permissions: esPermissions, screens: esScreens, media: esMedia },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    supportedLngs: LOCALES.map((l) => l.code),
    load: "languageOnly",
    nonExplicitSupportedLngs: true,
    ns: ["common", "auth", "onboarding", "welcome", "settings", "permissions", "screens", "media"],
    defaultNS: "common",
    interpolation: { escapeValue: false },
    detection: {
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
