import { useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { AuthTitleBar } from "../components/AuthTitleBar";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { Permissions } from "./Permissions";
import type { AppSettings, CaptureManaged } from "./Settings";

import enSettings from "../i18n/locales/en/settings.json";
import zhSettings from "../i18n/locales/zh/settings.json";
import jaSettings from "../i18n/locales/ja/settings.json";
import viSettings from "../i18n/locales/vi/settings.json";
import idSettings from "../i18n/locales/id/settings.json";
import frSettings from "../i18n/locales/fr/settings.json";
import esSettings from "../i18n/locales/es/settings.json";

// The capture controls reuse the `settings` namespace labels/units; register it here
// too (idempotent) so onboarding works even if Settings hasn't mounted yet.
const SETTINGS_BUNDLES: Record<string, object> = {
  en: enSettings, zh: zhSettings, ja: jaSettings, vi: viSettings,
  id: idSettings, fr: frSettings, es: esSettings,
};
for (const [lng, bundle] of Object.entries(SETTINGS_BUNDLES)) {
  if (!i18n.hasResourceBundle(lng, "settings")) {
    i18n.addResourceBundle(lng, "settings", bundle, true, true);
  }
}

/* ---- inline icons ---- */
const CameraIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M14.5 4h-5L8 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-4z" /><circle cx="12" cy="13" r="3.5" />
  </svg>
);
const KeyboardIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M10 8h.01" /><path d="M12 12h.01" /><path d="M14 8h.01" /><path d="M16 12h.01" /><path d="M18 8h.01" /><path d="M6 8h.01" /><path d="M7 16h10" /><path d="M8 12h.01" /><rect width="20" height="16" x="2" y="4" rx="2" />
  </svg>
);
const ClockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
  </svg>
);
const GlobeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" />
  </svg>
);
const EyeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const TimerIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="13" r="8" /><path d="M12 9v4M9 2h6M12 5V2" />
  </svg>
);
const CoffeeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 8h13v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8z" /><path d="M17 9h2a2 2 0 0 1 0 4h-2M7 2v2M11 2v2" />
  </svg>
);
const HistoryIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 4v4h4M12 8v4l3 2" />
  </svg>
);
const Arrow = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
const BackArrow = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m12 19-7-7 7-7M19 12H5" />
  </svg>
);
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

type Persona = "personal" | "employee" | "kid";

type TF = ReturnType<typeof useTranslation>["t"];

/* ---- Step 1: What BiBoTracking captures (capture cards + who-sees) ---- */
function StepCaptures({ t, persona }: { t: TF; persona: Persona }) {
  return (
    <>
      <h1 className="login-title">{t("welcome:consent.title")}</h1>
      <p className="login-sub">{t("welcome:consent.subtitle")}</p>
      <div className="capture-grid">
        <div className="capture-card cc-purple">
          <span className="capture-ic"><CameraIcon /></span>
          <span className="capture-text">
            <span className="capture-t">{t("welcome:consent.shots.t")}</span>
            <span className="capture-d">{t("welcome:consent.shots.d")}</span>
          </span>
        </div>
        <div className="capture-card cc-blue">
          <span className="capture-ic"><KeyboardIcon /></span>
          <span className="capture-text">
            <span className="capture-t">{t("welcome:consent.keys.t")}</span>
            <span className="capture-d">{t("welcome:consent.keys.d")}</span>
          </span>
        </div>
        <div className="capture-card cc-green">
          <span className="capture-ic"><ClockIcon /></span>
          <span className="capture-text">
            <span className="capture-t">{t("welcome:consent.activity.t")}</span>
            <span className="capture-d">{t("welcome:consent.activity.d")}</span>
          </span>
        </div>
        <div className="capture-card cc-amber">
          <span className="capture-ic"><GlobeIcon /></span>
          <span className="capture-text">
            <span className="capture-t">{t("welcome:consent.web.t")}</span>
            <span className="capture-d">{t("welcome:consent.web.d")}</span>
          </span>
        </div>
      </div>
      <div className="capture-who">
        <EyeIcon />
        <div>
          <span className="capture-who-label">{t("welcome:consent.whoLabel")}</span>
          <span className="capture-who-text">
            {persona === "personal" ? t("welcome:consent.whoLocal") : t("welcome:consent.whoTeam")}
          </span>
        </div>
      </div>
    </>
  );
}

/* ---- Step 2: Configure capture (toggles + selects) ---- */
function OnbSelect({
  value, options, disabled, onChange,
}: {
  value: number;
  options: { label: string; value: number }[];
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <select
      className="onb-select"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.currentTarget.value))}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function StepConfigure({
  t, settings, onChange, captureLocked,
}: {
  t: TF;
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  captureLocked: boolean;
}) {
  return (
    <>
      <h1 className="login-title">{t("step2.title")}</h1>
      <p className="login-sub">{t("step2.subtitle")}</p>
      <div className="onb-set-list">
        <div className="onb-set-row">
          <span className="onb-set-ic"><CameraIcon /></span>
          <span className="onb-set-label">{t("settings:captureScreenshots")}</span>
          <button
            className={`switch ${settings.capture_screenshots ? "" : "off"}`}
            disabled={captureLocked}
            onClick={() => onChange({ capture_screenshots: !settings.capture_screenshots })}
          />
        </div>
        <div className="onb-set-row">
          <span className="onb-set-ic"><KeyboardIcon /></span>
          <span className="onb-set-label">{t("settings:countKeystrokes")}</span>
          <button
            className={`switch ${settings.count_keystrokes ? "" : "off"}`}
            disabled={captureLocked}
            onClick={() => onChange({ count_keystrokes: !settings.count_keystrokes })}
          />
        </div>
        <div className="onb-set-row">
          <span className="onb-set-ic"><TimerIcon /></span>
          <span className="onb-set-label">{t("settings:screenshotInterval")}</span>
          <OnbSelect
            value={settings.screenshot_interval_s}
            disabled={captureLocked || !settings.capture_screenshots}
            onChange={(v) => onChange({ screenshot_interval_s: v })}
            options={[
              { label: t("settings:minUnit", { count: 1 }), value: 60 },
              { label: t("settings:minUnit", { count: 5 }), value: 300 },
              { label: t("settings:minUnit", { count: 10 }), value: 600 },
              { label: t("settings:minUnit", { count: 15 }), value: 900 },
            ]}
          />
        </div>
        <div className="onb-set-row">
          <span className="onb-set-ic"><CoffeeIcon /></span>
          <span className="onb-set-label">{t("settings:idleThreshold")}</span>
          <OnbSelect
            value={settings.idle_threshold_s}
            disabled={captureLocked}
            onChange={(v) => onChange({ idle_threshold_s: v })}
            options={[
              { label: t("settings:secUnit", { count: 60 }), value: 60 },
              { label: t("settings:minUnit", { count: 3 }), value: 180 },
              { label: t("settings:minUnit", { count: 5 }), value: 300 },
            ]}
          />
        </div>
        <div className="onb-set-row">
          <span className="onb-set-ic"><HistoryIcon /></span>
          <span className="onb-set-label">{t("settings:screenshotRetention")}</span>
          <OnbSelect
            value={settings.screenshot_retention_days}
            disabled={captureLocked}
            onChange={(v) => onChange({ screenshot_retention_days: v })}
            options={[
              { label: t("settings:daysUnit", { count: 7 }), value: 7 },
              { label: t("settings:daysUnit", { count: 30 }), value: 30 },
              { label: t("settings:daysUnit", { count: 90 }), value: 90 },
            ]}
          />
        </div>
      </div>
    </>
  );
}

/* ---- Step 3: Permissions ---- */
function StepPermissions({ t }: { t: TF }) {
  return (
    <>
      <span className="perm-shield" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l8 3v5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      </span>
      <h1 className="login-title">{t("step3.heading")}</h1>
      <p className="login-sub">{t("step3.subtitle")}</p>
      <div className="onb-perms">
        <Permissions compact />
      </div>
    </>
  );
}

/**
 * Onboarding — the post-auth 3-step flow (until `onboarding_completed`), matching
 * the offline-app mockup: centered surface, a step-pip header, and a Skip/Back +
 * Next/Finish footer. Step 1 doubles as the capture disclosure (sets `consented`).
 */
export function Onboarding({
  settings,
  captureManaged,
  onChange,
  onFinish,
}: {
  settings: AppSettings;
  captureManaged: CaptureManaged | null;
  onChange: (patch: Partial<AppSettings>) => void;
  onFinish: () => void;
}) {
  const { t } = useTranslation(["onboarding", "welcome", "media", "auth", "settings"]);
  const [step, setStep] = useState(1);

  const persona: Persona = settings.local_only
    ? "personal"
    : captureManaged?.family
      ? "kid"
      : "employee";
  const captureLocked =
    !!captureManaged && captureManaged.managed && !captureManaged.allow_employee_override;

  const next = () => (step < 3 ? setStep(step + 1) : onFinish());
  const back = () => setStep((s) => Math.max(1, s - 1));

  return (
    <div className="login welcome onboarding-screen">
      <AuthTitleBar />
      <div className="welcome-lang">
        <LanguageSwitcher compact />
      </div>

      <div className="capture-steps">
        <div className="capture-pips">
          {[1, 2, 3].map((n) => (
            <span key={n} className={`pip ${n < step ? "done" : n === step ? "on" : ""}`} />
          ))}
        </div>
        <span className="capture-step-label">
          {t("media:ui.stepOf", { current: step, total: 3 })}
        </span>
      </div>

      <div className="login-card">
        {step === 1 && <StepCaptures t={t} persona={persona} />}
        {step === 2 && (
          <StepConfigure t={t} settings={settings} onChange={onChange} captureLocked={captureLocked} />
        )}
        {step === 3 && <StepPermissions t={t} />}
      </div>

      <div className="capture-foot">
        {step === 1 ? (
          <button type="button" className="capture-skip" onClick={onFinish}>
            {t("welcome:consent.skip")}
          </button>
        ) : (
          <button type="button" className="capture-skip onb-back" onClick={back}>
            <BackArrow />
            {t("auth:login.back")}
          </button>
        )}
        <button type="button" className="auth-btn capture-next" onClick={next}>
          {step < 3 ? (
            <>
              {t("welcome:consent.next")}
              <Arrow />
            </>
          ) : (
            <>
              <CheckIcon />
              {t("actions.finish")}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
