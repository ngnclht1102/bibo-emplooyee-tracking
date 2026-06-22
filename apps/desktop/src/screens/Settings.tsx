import { useEffect, useState } from "react";
import { call as invoke } from "../api";
import { open } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { checkForUpdates } from "../updater";

import enSettings from "../i18n/locales/en/settings.json";
import zhSettings from "../i18n/locales/zh/settings.json";
import jaSettings from "../i18n/locales/ja/settings.json";
import viSettings from "../i18n/locales/vi/settings.json";
import idSettings from "../i18n/locales/id/settings.json";
import frSettings from "../i18n/locales/fr/settings.json";
import esSettings from "../i18n/locales/es/settings.json";

// Register the `settings` namespace without modifying the shared i18n init.
const SETTINGS_BUNDLES: Record<string, object> = {
  en: enSettings,
  zh: zhSettings,
  ja: jaSettings,
  vi: viSettings,
  id: idSettings,
  fr: frSettings,
  es: esSettings,
};
for (const [lng, bundle] of Object.entries(SETTINGS_BUNDLES)) {
  if (!i18n.hasResourceBundle(lng, "settings")) {
    i18n.addResourceBundle(lng, "settings", bundle, true, true);
  }
}

export type AppSettings = {
  theme: string;
  idle_threshold_s: number;
  screenshot_interval_s: number;
  screenshot_retention_days: number;
  domain_only: boolean;
  hide_dock: boolean;
  capture_screenshots: boolean;
  count_keystrokes: boolean;
  consented: boolean;
  local_only: boolean;
  onboarding_completed: boolean;
};

const IS_WINDOWS = navigator.userAgent.includes("Windows");

type FileResult = { name: string; rows: number };
type ExportSummary = { dir: string; files: FileResult[] };
type BrowserLinkInfo = { port: number | null; token_active: boolean };

function Row({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="set-row">
      <div>
        <div className="set-title">{title}</div>
        {desc && <div className="set-desc">{desc}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function NumSelect({
  value,
  options,
  onChange,
  disabled,
}: {
  value: number;
  options: { label: string; value: number }[];
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <select
      className="btn"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.currentTarget.value))}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export type CaptureManaged = {
  managed: boolean;
  allow_employee_override: boolean;
  family: boolean;
};

export function Settings({
  settings,
  captureManaged,
  onChange,
  onOpenPermissions,
}: {
  settings: AppSettings | null;
  captureManaged: CaptureManaged | null;
  onChange: (patch: Partial<AppSettings>) => void;
  onOpenPermissions: () => void;
}) {
  const { t } = useTranslation("settings");
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [link, setLink] = useState<BrowserLinkInfo | null>(null);
  const [updMsg, setUpdMsg] = useState<string>("");
  const [updBusy, setUpdBusy] = useState(false);

  useEffect(() => {
    invoke<BrowserLinkInfo>("browser_link").then(setLink).catch(() => {});
  }, []);

  // Manual update check (auto-check also runs once on launch). Strings are kept in
  // English here — localize via the settings namespace later if needed.
  async function runUpdateCheck() {
    setUpdBusy(true);
    setUpdMsg("");
    const found = await checkForUpdates((p) => {
      switch (p.state) {
        case "checking": setUpdMsg("Checking for updates…"); break;
        case "uptodate": setUpdMsg("You're on the latest version."); break;
        case "available": setUpdMsg(`Update ${p.version} found — downloading…`); break;
        case "downloading": setUpdMsg(`Downloading… ${p.pct}%`); break;
        case "installing": setUpdMsg("Installing — the app will restart…"); break;
        case "error": setUpdMsg(`Update failed: ${p.message}`); break;
      }
    });
    if (!found) setUpdBusy(false); // on success the app relaunches into the new build
  }

  // Capture settings are locked when the org manages them and hasn't allowed overrides.
  const captureLocked =
    !!captureManaged && captureManaged.managed && !captureManaged.allow_employee_override;

  async function runExport(kind: "csv" | "json") {
    setExportMsg(null);
    const dir = await open({ directory: true, title: t("chooseExportFolder") });
    if (!dir || typeof dir !== "string") return;
    setExporting(true);
    try {
      const cmd = kind === "csv" ? "export_csv" : "export_json";
      const summary = await invoke<ExportSummary>(cmd, {
        dir,
        fromTs: 0,
        toTs: Math.floor(Date.now() / 1000) + 86400,
      });
      const total = summary.files.reduce((n, f) => n + f.rows, 0);
      setExportMsg(
        t("exportSuccess", { files: summary.files.length, rows: total, dir: summary.dir }),
      );
    } catch (e) {
      setExportMsg(t("exportFailed", { error: String(e) }));
    } finally {
      setExporting(false);
    }
  }

  if (!settings) {
    return <div className="muted">{t("loading")}</div>;
  }

  return (
    <div style={{ maxWidth: 680, display: "flex", flexDirection: "column", gap: 24 }}>
      <section>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>{t("general")}</div>
        <div className="set-group">
          <Row title={t("language", { ns: "common" })}>
            <LanguageSwitcher />
          </Row>
          <Row
            title={IS_WINDOWS ? t("hideDockWindows") : t("hideDockMac")}
            desc={IS_WINDOWS ? t("hideDockDescWindows") : t("hideDockDescMac")}
          >
            <button
              className={`switch ${settings.hide_dock ? "" : "off"}`}
              onClick={() => onChange({ hide_dock: !settings.hide_dock })}
            />
          </Row>
        </div>
      </section>

      <section>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Updates</div>
        <div className="set-group">
          <Row title="App updates" desc="Checked automatically on launch. You can also check now.">
            <button className="btn" onClick={runUpdateCheck} disabled={updBusy}>
              {updBusy ? "Checking…" : "Check for updates"}
            </button>
          </Row>
          {updMsg && (
            <div className="muted" style={{ fontSize: 12, padding: "8px 0 0" }}>
              {updMsg}
            </div>
          )}
        </div>
      </section>

      <section>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>{t("capture")}</div>
        {captureLocked && (
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            {t("managedNotice")}
          </div>
        )}
        <div className="set-group">
          <Row
            title={t("captureScreenshots")}
            desc={t("captureScreenshotsDesc")}
          >
            <button
              className={`switch ${settings.capture_screenshots ? "" : "off"}`}
              disabled={captureLocked}
              onClick={() => onChange({ capture_screenshots: !settings.capture_screenshots })}
            />
          </Row>
          <Row
            title={t("countKeystrokes")}
            desc={t("countKeystrokesDesc")}
          >
            <button
              className={`switch ${settings.count_keystrokes ? "" : "off"}`}
              disabled={captureLocked}
              onClick={() => onChange({ count_keystrokes: !settings.count_keystrokes })}
            />
          </Row>
          <Row title={t("screenshotInterval")} desc={t("screenshotIntervalDesc")}>
            <NumSelect
              value={settings.screenshot_interval_s}
              disabled={captureLocked || !settings.capture_screenshots}
              onChange={(v) => onChange({ screenshot_interval_s: v })}
              options={[
                { label: t("minUnit", { count: 1 }), value: 60 },
                { label: t("minUnit", { count: 5 }), value: 300 },
                { label: t("minUnit", { count: 10 }), value: 600 },
                { label: t("minUnit", { count: 15 }), value: 900 },
              ]}
            />
          </Row>
          <Row title={t("idleThreshold")} desc={t("idleThresholdDesc")}>
            <NumSelect
              value={settings.idle_threshold_s}
              disabled={captureLocked}
              onChange={(v) => onChange({ idle_threshold_s: v })}
              options={[
                { label: t("secUnit", { count: 60 }), value: 60 },
                { label: t("minUnit", { count: 3 }), value: 180 },
                { label: t("minUnit", { count: 5 }), value: 300 },
              ]}
            />
          </Row>
          <Row title={t("screenshotRetention")} desc={t("screenshotRetentionDesc")}>
            <NumSelect
              value={settings.screenshot_retention_days}
              disabled={captureLocked}
              onChange={(v) => onChange({ screenshot_retention_days: v })}
              options={[
                { label: t("daysUnit", { count: 7 }), value: 7 },
                { label: t("daysUnit", { count: 30 }), value: 30 },
                { label: t("daysUnit", { count: 90 }), value: 90 },
              ]}
            />
          </Row>
        </div>
      </section>

      <section>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>{t("privacy")}</div>
        <div className="set-group">
          <Row title={t("storeDomainOnly")} desc={t("storeDomainOnlyDesc")}>
            <button
              className={`switch ${settings.domain_only ? "" : "off"}`}
              onClick={() => onChange({ domain_only: !settings.domain_only })}
            />
          </Row>
          <Row
            title={IS_WINDOWS ? t("whatsCaptured") : t("permissions")}
            desc={IS_WINDOWS ? t("whatsCapturedDesc") : t("permissionsDesc")}
          >
            <button className="btn" onClick={onOpenPermissions}>
              {t("manage")}
            </button>
          </Row>
        </div>
      </section>

      <section>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>{t("browserLink")}</div>
        <div className="set-group">
          <Row title={t("ingestPort")} desc={t("ingestPortDesc")}>
            <span className="num muted">
              {link ? (link.port ? `127.0.0.1 : ${link.port}` : t("noFreePort")) : "…"}
            </span>
          </Row>
          <Row title={t("pairingToken")} desc={t("pairingTokenDesc")}>
            <span className={`pill ${link?.token_active ? "pill-success" : "pill-danger"}`}>
              {link?.token_active ? t("tokenActive") : t("tokenNone")}
            </span>
          </Row>
        </div>
      </section>

      <section>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>{t("export")}</div>
        <div className="row">
          <button className="btn btn-primary" onClick={() => runExport("csv")} disabled={exporting}>
            {exporting ? t("exporting") : t("exportCsv")}
          </button>
          <button className="btn" onClick={() => runExport("json")} disabled={exporting}>
            {t("exportJson")}
          </button>
        </div>
        {exportMsg && (
          <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            {exportMsg}
          </div>
        )}
      </section>
    </div>
  );
}
