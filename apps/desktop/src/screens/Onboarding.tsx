import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BrandLogo, ProgressRail, StepDots, type RailStep } from "../ui";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { Permissions } from "./Permissions";
import type { AppSettings, CaptureManaged } from "./Settings";

type Persona = "personal" | "employee" | "kid";

const BRAND = "BiBoTracking";

/**
 * Onboarding — shown once after the welcome/login gate (until
 * `onboarding_completed`). Two-column rail layout matching the web wizard; the
 * content + which toggles are editable adapt to persona.
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
  const { t } = useTranslation("onboarding");
  const [step, setStep] = useState(1);

  const persona: Persona = settings.local_only
    ? "personal"
    : captureManaged?.family
      ? "kid"
      : "employee";

  // Org-locked capture controls (employees/kids whose org disallows overrides).
  const captureLocked =
    !!captureManaged && captureManaged.managed && !captureManaged.allow_employee_override;

  const rail: RailStep[] = [
    { title: t("rail.step1Title"), description: t("rail.step1Desc") },
    { title: t("rail.step2Title"), description: t("rail.step2Desc") },
    { title: t("rail.step3Title"), description: t("rail.step3Desc") },
  ];

  return (
    <div className="login welcome">
      <div className="welcome-lang">
        <LanguageSwitcher />
      </div>
      <BrandLogo />
      <div className="welcome-split">
        <div className="welcome-main">
          {step > 1 && (
            <button className="link-row back-top" onClick={() => setStep(step - 1)}>
              {t("actions.back")}
            </button>
          )}
          <div className="show-narrow" style={{ marginBottom: 16 }}>
            <StepDots total={3} current={step} />
          </div>

          {step === 1 && (
            <div>
              <h2 style={{ marginTop: 0 }}>
                <span aria-hidden>👋 </span>
                {t("step1.heading", { brand: BRAND })}
              </h2>
              <p className="muted">{t("step1.intro")}</p>
              <ul style={{ lineHeight: 1.7, paddingLeft: 18 }}>
                <li>{t("step1.bullets.foreground")}</li>
                <li>{t("step1.bullets.keypress")}</li>
                <li>{t("step1.bullets.screenshots")}</li>
                <li>{t("step1.bullets.webPages")}</li>
              </ul>
              <div className="notice notice-info" style={{ marginTop: 12 }}>
                {t(`whoSees.${persona}`)}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 style={{ marginTop: 0 }}>
                <span aria-hidden>⚙ </span>
                {t("step2.heading")}
              </h2>
              {captureLocked && (
                <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                  {t("step2.managedNote", {
                    owner: persona === "kid" ? t("step2.owner.parent") : t("step2.owner.team"),
                  })}
                </div>
              )}
              <div className="set-group">
                <ToggleRow
                  title={t("step2.screenshots.title")}
                  desc={t("step2.screenshots.desc")}
                  on={settings.capture_screenshots}
                  disabled={captureLocked}
                  onToggle={() => onChange({ capture_screenshots: !settings.capture_screenshots })}
                />
                <ToggleRow
                  title={t("step2.keypress.title")}
                  desc={t("step2.keypress.desc")}
                  on={settings.count_keystrokes}
                  disabled={captureLocked}
                  onToggle={() => onChange({ count_keystrokes: !settings.count_keystrokes })}
                />
                <ToggleRow
                  title={t("step2.domainOnly.title")}
                  desc={t("step2.domainOnly.desc")}
                  on={settings.domain_only}
                  disabled={false}
                  onToggle={() => onChange({ domain_only: !settings.domain_only })}
                />
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                {t("step2.changeLater")}
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 style={{ marginTop: 0 }}>
                <span aria-hidden>🔐 </span>
                {t("step3.heading")}
              </h2>
              <Permissions />
            </div>
          )}

          <div className="onb-actions">
            {step < 3 ? (
              <button className="btn btn-primary btn-block" onClick={() => setStep(step + 1)}>
                {t("actions.next")}
              </button>
            ) : (
              <button className="btn btn-primary btn-block" onClick={onFinish}>
                {t("actions.finish")}
              </button>
            )}
            {step === 1 && (
              <button className="link-row onb-skip" onClick={onFinish}>
                {t("actions.skip")}
              </button>
            )}
          </div>
        </div>

        <aside className="rail-panel">
          <ProgressRail steps={rail} current={step} />
        </aside>
      </div>
    </div>
  );
}

function ToggleRow({
  title,
  desc,
  on,
  disabled,
  onToggle,
}: {
  title: string;
  desc: string;
  on: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="set-row">
      <div>
        <div className="set-title">{title}</div>
        <div className="set-desc">{desc}</div>
      </div>
      <button className={`switch ${on ? "" : "off"}`} disabled={disabled} onClick={onToggle} />
    </div>
  );
}
