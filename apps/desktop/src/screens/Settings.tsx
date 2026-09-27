import { useEffect, useRef, useState } from "react";
import { call as invoke } from "../api";
import { open } from "@tauri-apps/plugin-dialog";
import { getVersion } from "@tauri-apps/api/app";
import { useTranslation } from "react-i18next";
import i18n, { LOCALES } from "../i18n";
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
  upload_screenshots: boolean;
  screenshot_mode: string;
  screenshot_skip_apps: string[];
  count_keystrokes: boolean;
  consented: boolean;
  local_only: boolean;
  onboarding_completed: boolean;
};

const IS_WINDOWS = navigator.userAgent.includes("Windows");

// The curated sensitive-app list (backend-served via the `privacy_apps`
// command, baked-in fallback offline), rendered as skip-list suggestions.
type PrivacyAppCategory = { key: string; apps: string[] };

/** Normalize a stored mode (incl. pre-rename values) to the two current modes. */
function normalizeMode(m: string): "privacy" | "normal" {
  return m === "normal" || m === "full_screen" ? "normal" : "privacy";
}

/** One selectable screenshot-mode card: radio dot + label + explanation. */
function ModeOption({
  label,
  desc,
  selected,
  disabled,
  onSelect,
}: {
  label: string;
  desc: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        textAlign: "left",
        width: "100%",
        font: "inherit",
        color: "var(--text)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
        background: selected ? "var(--accent-weak)" : "var(--bg-inset)",
        border: selected ? "1px solid var(--accent)" : "1px solid var(--border)",
        borderRadius: 11,
        padding: "10px 12px",
      }}
    >
      <span
        aria-hidden
        style={{
          flexShrink: 0,
          marginTop: 2,
          width: 14,
          height: 14,
          borderRadius: "50%",
          border: selected ? "4px solid var(--accent)" : "2px solid var(--border)",
        }}
      />
      <span>
        <span style={{ display: "block", fontWeight: 600, fontSize: 13 }}>{label}</span>
        <span className="bb-row__desc" style={{ display: "block", marginTop: 2 }}>{desc}</span>
      </span>
    </button>
  );
}

type FileResult = { name: string; rows: number };
type ExportSummary = { dir: string; files: FileResult[] };
type BrowserLinkInfo = { port: number | null; token_active: boolean };

/* ---------- icons (lucide, inline to match the offline design) ---------- */
const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </svg>
);
const ArrowRightIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
  </svg>
);
const KeyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4" />
    <path d="m21 2-9.6 9.6" />
    <circle cx="7.5" cy="15.5" r="5.5" />
  </svg>
);
const FileSpreadsheetIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
    <path d="M14 2v5a1 1 0 0 0 1 1h5" />
    <path d="M8 13h2" /><path d="M14 13h2" /><path d="M8 17h2" /><path d="M14 17h2" />
  </svg>
);
const FileJsonIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
    <path d="M14 2v5a1 1 0 0 0 1 1h5" />
    <path d="M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1" />
    <path d="M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1" />
  </svg>
);
const ChevronDownIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

/* A settings section: an uppercase label above one bordered card of rows. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="bb-set__sec-title">{title}</div>
      <div className="bibo-card bibo-card--default bb-card-pad">{children}</div>
    </div>
  );
}

/* One row inside a card: title (+ optional description) on the left, control on the right. */
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
    <div className="bb-row">
      <div className="bb-row__main">
        <div className="bb-row__title">{title}</div>
        {desc && <div className="bb-row__desc">{desc}</div>}
      </div>
      <div className="bb-row__ctrl">{children}</div>
    </div>
  );
}

/* A styled dropdown (button trigger + popup listbox) matching the design's bibo-select. */
function Select<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
  width,
}: {
  value: T;
  options: { label: string; value: T }[];
  onChange: (v: T) => void;
  disabled?: boolean;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="bibo-select" ref={ref} style={width ? { width } : undefined}>
      <button
        type="button"
        className="bibo-select__btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="bibo-select__val">{current?.label ?? ""}</span>
        <span className="bibo-select__chev">
          <ChevronDownIcon />
        </span>
      </button>
      {open && (
        <div className="bibo-select__menu" role="listbox">
          {options.map((o) => (
            <button
              type="button"
              key={String(o.value)}
              role="option"
              aria-selected={o.value === value}
              className={`bibo-select__opt${o.value === value ? " active" : ""}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* The design's pill toggle (track + sliding knob). */
function Switch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={`bibo-switch${checked ? " bibo-switch--on" : ""}`}>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      <span className="bibo-switch__track">
        <span className="bibo-switch__knob" />
      </span>
    </label>
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
  const [version, setVersion] = useState<string>("");
  const [skipAppInput, setSkipAppInput] = useState("");
  const [skipOpen, setSkipOpen] = useState(false);
  const [privacyApps, setPrivacyApps] = useState<PrivacyAppCategory[]>([]);

  useEffect(() => {
    invoke<BrowserLinkInfo>("browser_link").then(setLink).catch(() => {});
    getVersion().then(setVersion).catch(() => {});
    invoke<PrivacyAppCategory[]>("privacy_apps").then(setPrivacyApps).catch(() => {});
  }, []);

  // Manual update check (auto-check also runs once on launch). Progress strings are
  // transient status and kept in English here (localize via settings later if needed).
  async function runUpdateCheck() {
    setUpdBusy(true);
    setUpdMsg("");
    await checkForUpdates((p) => {
      switch (p.state) {
        case "checking": setUpdMsg("Checking for updates…"); break;
        case "uptodate": setUpdMsg("You're on the latest version."); break;
        case "available": setUpdMsg(`Update ${p.version} found — downloading…`); break;
        case "downloading": setUpdMsg(`Downloading… ${p.pct}%`); break;
        case "ready": setUpdMsg(`Update ${p.version} ready — restart to apply.`); break;
        case "error": setUpdMsg(`Update failed: ${p.message}`); break;
      }
    });
    // We no longer auto-relaunch — the user is prompted to restart, so re-enable the
    // button whether they restarted, postponed, or were already up to date.
    setUpdBusy(false);
  }

  // Capture settings are locked when the org manages them and hasn't allowed overrides.
  const captureLocked =
    !!captureManaged && captureManaged.managed && !captureManaged.allow_employee_override;

  function addSkipApp() {
    if (!settings) return;
    const name = skipAppInput.trim();
    setSkipAppInput("");
    if (!name) return;
    const cur = settings.screenshot_skip_apps;
    if (cur.some((a) => a.toLowerCase() === name.toLowerCase())) return;
    onChange({ screenshot_skip_apps: [...cur, name] });
  }

  const hasSkipApp = (a: string) =>
    !!settings && settings.screenshot_skip_apps.some((x) => x.toLowerCase() === a.toLowerCase());

  // Entries the user typed themselves (not part of any suggested category).
  const suggestedLower = new Set(
    privacyApps.flatMap((c) => c.apps.map((a) => a.toLowerCase())),
  );
  const customSkipApps = (settings?.screenshot_skip_apps ?? []).filter(
    (a) => !suggestedLower.has(a.toLowerCase()),
  );

  function addSkipApps(apps: string[]) {
    if (!settings) return;
    const fresh = apps.filter((a) => !hasSkipApp(a));
    if (fresh.length) {
      onChange({ screenshot_skip_apps: [...settings.screenshot_skip_apps, ...fresh] });
    }
  }

  function removeSkipApps(apps: string[]) {
    if (!settings) return;
    const drop = new Set(apps.map((a) => a.toLowerCase()));
    onChange({
      screenshot_skip_apps: settings.screenshot_skip_apps.filter((x) => !drop.has(x.toLowerCase())),
    });
  }

  function setMode(m: "privacy" | "normal") {
    if (!settings) return;
    const patch: Partial<AppSettings> = { screenshot_mode: m };
    // Switching into privacy with an empty skip list prefills the curated rules.
    if (m === "privacy" && settings.screenshot_skip_apps.length === 0 && privacyApps.length > 0) {
      patch.screenshot_skip_apps = privacyApps.flatMap((c) => c.apps);
    }
    onChange(patch);
  }

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

  const curLang = LOCALES.find((l) => l.code === i18n.resolvedLanguage)?.code ?? "en";

  return (
    <div className="bb-set">
      <Section title={t("general")}>
        <Row title={t("displayLanguage")}>
          <Select
            width={200}
            value={curLang}
            options={LOCALES.map((l) => ({ value: l.code, label: l.label }))}
            onChange={(code) => {
              i18n.changeLanguage(code);
              // Mirror to native settings so the tray menu/tooltip localize too.
              invoke("set_locale", { locale: code }).catch(() => {});
            }}
          />
        </Row>
        <Row
          title={IS_WINDOWS ? t("hideDockWindows") : t("hideDockMac")}
          desc={IS_WINDOWS ? t("hideDockDescWindows") : t("hideDockDescMac")}
        >
          <Switch
            checked={settings.hide_dock}
            onChange={(v) => onChange({ hide_dock: v })}
          />
        </Row>
      </Section>

      <Section title={t("updates")}>
        <Row title={t("version")}>
          <span className="bb-readonly">{version ? `v${version}` : "…"}</span>
        </Row>
        <Row title={t("checkForUpdates")}>
          <button
            className="bibo-btn bibo-btn--secondary bibo-btn--sm"
            onClick={runUpdateCheck}
            disabled={updBusy}
          >
            <span className="bb-upd-ic" style={{ display: "inline-flex", lineHeight: 0 }}>
              <RefreshIcon />
            </span>
            <span>{updBusy ? "Checking…" : t("checkForUpdates")}</span>
          </button>
        </Row>
        {updMsg && (
          <div className="muted" style={{ fontSize: 12, padding: "10px 2px 0" }}>
            {updMsg}
          </div>
        )}
      </Section>

      {captureLocked ? (
        // Org-managed and no override allowed: the capture settings are not
        // rendered at all — just the notice.
        <Section title={t("capture")}>
          <div className="muted" style={{ fontSize: 12, padding: "12px 2px" }}>
            {t("managedNotice")}
          </div>
        </Section>
      ) : (
        <>
          <Section title={t("screenshots")}>
            <Row title={t("captureScreenshots")}>
              <Switch
                checked={settings.capture_screenshots}
                onChange={(v) => onChange({ capture_screenshots: v })}
              />
            </Row>
            {settings.capture_screenshots && (
              <>
                {!settings.local_only && (
                  <Row title={t("uploadScreenshots")} desc={t("uploadScreenshotsDesc")}>
                    <Switch
                      checked={settings.upload_screenshots}
                      onChange={(v) => onChange({ upload_screenshots: v })}
                    />
                  </Row>
                )}
                <Row title={t("screenshotMode")} desc={t("screenshotModeDesc")}>
                  <div role="radiogroup" aria-label={t("screenshotMode")} style={{ display: "grid", gap: 8, width: 320, maxWidth: "100%" }}>
                    <ModeOption
                      label={t("modePrivacy")}
                      desc={t("modePrivacyDesc")}
                      selected={normalizeMode(settings.screenshot_mode) === "privacy"}
                      onSelect={() => setMode("privacy")}
                    />
                    <ModeOption
                      label={t("modeNormal")}
                      desc={t("modeNormalDesc")}
                      selected={normalizeMode(settings.screenshot_mode) === "normal"}
                      onSelect={() => setMode("normal")}
                    />
                  </div>
                </Row>
                {normalizeMode(settings.screenshot_mode) === "privacy" && (
                  <Row title={t("skipApps")} desc={t("skipAppsDesc")}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span className="bb-readonly">
                        {t("skipAppsCount", { count: settings.screenshot_skip_apps.length })}
                      </span>
                      <button
                        className="bibo-btn bibo-btn--secondary bibo-btn--sm"
                        onClick={() => setSkipOpen(true)}
                      >
                        {t("skipAppsManage")}
                      </button>
                    </div>
                  </Row>
                )}
                <Row title={t("screenshotInterval")}>
                  <Select
                    width={140}
                    value={settings.screenshot_interval_s}
                    onChange={(v) => onChange({ screenshot_interval_s: v })}
                    options={[
                      { label: t("minUnit", { count: 1 }), value: 60 },
                      { label: t("minUnit", { count: 5 }), value: 300 },
                      { label: t("minUnit", { count: 10 }), value: 600 },
                      { label: t("minUnit", { count: 15 }), value: 900 },
                    ]}
                  />
                </Row>
                <Row title={t("screenshotRetention")}>
                  <Select
                    width={140}
                    value={settings.screenshot_retention_days}
                    onChange={(v) => onChange({ screenshot_retention_days: v })}
                    options={[
                      { label: t("daysUnit", { count: 7 }), value: 7 },
                      { label: t("daysUnit", { count: 30 }), value: 30 },
                      { label: t("daysUnit", { count: 90 }), value: 90 },
                    ]}
                  />
                </Row>
              </>
            )}
          </Section>

          <Section title={t("capture")}>
            <Row title={t("countKeystrokes")}>
              <Switch
                checked={settings.count_keystrokes}
                onChange={(v) => onChange({ count_keystrokes: v })}
              />
            </Row>
            <Row title={t("idleThreshold")}>
              <Select
                width={140}
                value={settings.idle_threshold_s}
                onChange={(v) => onChange({ idle_threshold_s: v })}
                options={[
                  { label: t("secUnit", { count: 60 }), value: 60 },
                  { label: t("minUnit", { count: 3 }), value: 180 },
                  { label: t("minUnit", { count: 5 }), value: 300 },
                ]}
              />
            </Row>
          </Section>
        </>
      )}

      <Section title={t("privacy")}>
        <Row title={t("storeDomainOnly")} desc={t("storeDomainOnlyDesc")}>
          <Switch
            checked={settings.domain_only}
            onChange={(v) => onChange({ domain_only: v })}
          />
        </Row>
        <Row title={t("permissionsCaptured")}>
          <button className="bibo-btn bibo-btn--ghost bibo-btn--sm" onClick={onOpenPermissions}>
            <span>{IS_WINDOWS ? t("whatsCaptured") : t("permissions")}</span>
            <span style={{ display: "inline-flex", lineHeight: 0 }}>
              <ArrowRightIcon />
            </span>
          </button>
        </Row>
      </Section>

      <Section title={t("browserLink")}>
        <Row title={t("ingestPort")}>
          <span className="bb-readonly">
            {link ? (link.port ? `127.0.0.1 : ${link.port}` : t("noFreePort")) : "…"}
          </span>
        </Row>
        <Row title={t("pairingToken")}>
          {link?.token_active ? (
            <span className="bibo-badge bibo-badge--positive">
              <KeyIcon />
              {t("tokenActive")}
            </span>
          ) : (
            <span className="bibo-badge bibo-badge--negative">{t("tokenNone")}</span>
          )}
        </Row>
      </Section>

      <Section title={t("export")}>
        <Row title={t("export")}>
          <div className="bb-flex" style={{ gap: 8 }}>
            <button
              className="bibo-btn bibo-btn--white bibo-btn--sm"
              onClick={() => runExport("csv")}
              disabled={exporting}
            >
              <span className="bb-exp-ic" style={{ display: "inline-flex", lineHeight: 0 }}>
                <FileSpreadsheetIcon />
              </span>
              <span>{exporting ? t("exporting") : t("exportCsv")}</span>
            </button>
            <button
              className="bibo-btn bibo-btn--white bibo-btn--sm"
              onClick={() => runExport("json")}
              disabled={exporting}
            >
              <span className="bb-exp-ic" style={{ display: "inline-flex", lineHeight: 0 }}>
                <FileJsonIcon />
              </span>
              <span>{t("exportJson")}</span>
            </button>
          </div>
        </Row>
        {exportMsg && (
          <div className="muted" style={{ fontSize: 12, padding: "10px 2px 0" }}>
            {exportMsg}
          </div>
        )}
      </Section>

      {skipOpen && (
        <div
          onClick={() => setSkipOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
        >
          <div
            className="bibo-card bibo-card--default"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 480,
              maxWidth: "calc(100vw - 48px)",
              maxHeight: "calc(100vh - 96px)",
              display: "flex",
              flexDirection: "column",
              padding: 20,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div className="bb-row__title" style={{ fontSize: 15 }}>{t("skipAppsModalTitle")}</div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setSkipOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text)", fontSize: 18, lineHeight: 1 }}
              >
                ×
              </button>
            </div>
            <div className="bb-row__desc" style={{ marginBottom: 12 }}>{t("skipAppsDesc")}</div>

            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                value={skipAppInput}
                placeholder={t("skipAppsPlaceholder")}
                autoFocus
                onChange={(e) => setSkipAppInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSkipApp();
                  }
                }}
                style={{
                  font: "inherit",
                  fontSize: 13,
                  color: "var(--text)",
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  borderRadius: 11,
                  padding: "8px 12px",
                  flex: 1,
                }}
              />
              <button
                className="bibo-btn bibo-btn--secondary bibo-btn--sm"
                disabled={!skipAppInput.trim()}
                onClick={addSkipApp}
              >
                {t("skipAppsAdd")}
              </button>
            </div>

            {customSkipApps.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div className="bb-row__desc" style={{ marginBottom: 4 }}>{t("skipAppsCustom")}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {customSkipApps.map((a) => (
                    <span key={a} className="bibo-badge bibo-badge--positive">
                      {a}
                      <button
                        type="button"
                        aria-label={t("skipAppsRemove", { name: a })}
                        onClick={() => removeSkipApps([a])}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "inherit",
                          padding: 0,
                          lineHeight: 1,
                          fontSize: 13,
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ overflowY: "auto", flex: 1 }}>
              {privacyApps.map((cat) => {
                const added = cat.apps.filter(hasSkipApp);
                return (
                  <div key={cat.key} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span className="bb-row__desc" style={{ fontWeight: 600 }}>
                        {t(`skipAppsCat${cat.key}`)} ({added.length}/{cat.apps.length})
                      </span>
                      {added.length < cat.apps.length && (
                        <button
                          type="button"
                          className="bibo-btn bibo-btn--ghost bibo-btn--sm"
                          style={{ padding: "1px 8px", fontSize: 11 }}
                          onClick={() => addSkipApps(cat.apps)}
                        >
                          {t("skipAppsAddAll")}
                        </button>
                      )}
                      {added.length > 0 && (
                        <button
                          type="button"
                          className="bibo-btn bibo-btn--ghost bibo-btn--sm"
                          style={{ padding: "1px 8px", fontSize: 11 }}
                          onClick={() => removeSkipApps(cat.apps)}
                        >
                          {t("skipAppsRemoveAll")}
                        </button>
                      )}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {cat.apps.map((s) => {
                        const on = hasSkipApp(s);
                        return (
                          <button
                            key={s}
                            type="button"
                            role="checkbox"
                            aria-checked={on}
                            className="bibo-btn bibo-btn--sm"
                            style={{
                              padding: "2px 10px",
                              fontSize: 12,
                              borderRadius: 999,
                              border: on ? "1px solid var(--accent)" : "1px solid var(--border)",
                              background: on ? "var(--accent-weak)" : "transparent",
                              color: "var(--text)",
                              cursor: "pointer",
                            }}
                            onClick={() => (on ? removeSkipApps([s]) : addSkipApps([s]))}
                          >
                            {on ? "✓ " : "+ "}
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <button className="bibo-btn bibo-btn--secondary bibo-btn--sm" onClick={() => setSkipOpen(false)}>
                {t("skipAppsDone")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
