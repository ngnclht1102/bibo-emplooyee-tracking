import { useEffect, useState, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { cleanupScreenshots, getPrivacyApps, updateBusinessSettings } from "../api/endpoints";
import { ApiError, type BusinessSettingsPatch, type PrivacyAppCategory, type ScreenshotMode } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Empty, Modal, Notice, Spinner } from "../components/ui";
import { useBusinesses } from "../useBusinesses";
import { memberTerms } from "../terms";

// display-only icon (lucide trash-2), same svg pattern as other pages
const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const IconTrash = svg(<><path d="M10 11v6" /><path d="M14 11v6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>);

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const CLEANUP_PRESETS = [7, 14, 30, 90];

/** Normalize a stored mode (incl. pre-rename values) to the two current modes. */
function normalizeMode(m: string | undefined): ScreenshotMode {
  return m === "normal" || m === "full_screen" ? "normal" : "privacy";
}

/** One selectable mode card: radio dot + label + explanation. */
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
        color: "inherit",
        cursor: disabled ? "default" : "pointer",
        background: selected ? "var(--accent-weak)" : "transparent",
        border: selected ? "1px solid var(--accent)" : "1px solid var(--border)",
        borderRadius: 10,
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
        <span style={{ display: "block", fontWeight: 600 }}>{label}</span>
        <span className="muted" style={{ display: "block", fontSize: 12, marginTop: 2 }}>{desc}</span>
      </span>
    </button>
  );
}

// Interval/idle presets in seconds, with the minute count for label interpolation.
const INTERVAL_PRESETS = [
  { minutes: 1, value: 60 },
  { minutes: 5, value: 300 },
  { minutes: 10, value: 600 },
  { minutes: 15, value: 900 },
];
const IDLE_PRESETS = [
  { minutes: 1, value: 60 },
  { minutes: 3, value: 180 },
  { minutes: 5, value: 300 },
];

// null = "Never" (keep forever).
const PRESETS: { days: number | null; value: number | null }[] = [
  { days: 7, value: 7 },
  { days: 14, value: 14 },
  { days: 30, value: 30 },
  { days: 90, value: 90 },
  { days: null, value: null },
];

export function Settings() {
  const { t } = useTranslation("settings");
  const { user } = useAuth();
  const { businesses, selected, selectedId, loading, reload } = useBusinesses();
  const terms = memberTerms(selected?.kind);

  const [retention, setRetention] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "danger"; text: string } | null>(null);
  const [skipAppInput, setSkipAppInput] = useState("");
  const [skipOpen, setSkipOpen] = useState(false);
  // The curated sensitive-app list (backend-served) rendered as suggestions.
  const [privacyApps, setPrivacyApps] = useState<PrivacyAppCategory[]>([]);

  useEffect(() => {
    getPrivacyApps()
      .then((res) => setPrivacyApps(res.categories))
      .catch(() => {});
  }, []);

  // Manual "clean up now".
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cleanupDays, setCleanupDays] = useState(30);
  const [cleaning, setCleaning] = useState(false);

  useEffect(() => {
    if (selected) setRetention(selected.screenshot_retention_days);
  }, [selected]);

  async function runCleanup() {
    if (!selectedId) return;
    setCleaning(true);
    setMsg(null);
    try {
      const res = await cleanupScreenshots(selectedId, cleanupDays);
      setMsg({
        kind: "success",
        text: t("cleanup.removed", {
          count: res.deleted_count,
          size: formatBytes(res.bytes_freed),
        }),
      });
    } catch (err) {
      setMsg({
        kind: "danger",
        text: err instanceof ApiError ? err.message : t("cleanup.failed"),
      });
    } finally {
      setCleaning(false);
      setConfirmOpen(false);
    }
  }

  async function savePatch(patch: BusinessSettingsPatch, successText: string) {
    if (!selectedId) return;
    setSaving(true);
    setMsg(null);
    try {
      await updateBusinessSettings(selectedId, patch);
      await reload();
      setMsg({ kind: "success", text: successText });
    } catch (err) {
      setMsg({
        kind: "danger",
        text: err instanceof ApiError ? err.message : t("saveError"),
      });
    } finally {
      setSaving(false);
    }
  }

  function saveRetention(value: number | null) {
    setRetention(value);
    savePatch({ screenshot_retention_days: value }, t("retention.saved"));
  }

  const skipApps = selected?.screenshot_skip_apps ?? [];

  function saveMode(m: ScreenshotMode) {
    const patch: BusinessSettingsPatch = { screenshot_mode: m };
    // Switching into privacy with an empty skip list prefills the curated rules.
    if (m === "privacy" && skipApps.length === 0 && privacyApps.length > 0) {
      patch.screenshot_skip_apps = privacyApps.flatMap((c) => c.apps);
    }
    savePatch(patch, t("screenshotMode.saved"));
  }

  const hasSkipApp = (a: string) => skipApps.some((x) => x.toLowerCase() === a.toLowerCase());

  // Entries the owner typed themselves (not part of any suggested category).
  const suggestedLower = new Set(privacyApps.flatMap((c) => c.apps.map((a) => a.toLowerCase())));
  const customSkipApps = skipApps.filter((a) => !suggestedLower.has(a.toLowerCase()));

  function addSkipApp(app?: string) {
    const name = (app ?? skipAppInput).trim();
    if (!name || !selected) return;
    setSkipAppInput("");
    addSkipApps([name]);
  }

  function addSkipApps(apps: string[]) {
    const fresh = apps.filter((a) => !hasSkipApp(a));
    if (!fresh.length) return;
    savePatch({ screenshot_skip_apps: [...skipApps, ...fresh] }, t("skipApps.saved"));
  }

  function removeSkipApps(apps: string[]) {
    const drop = new Set(apps.map((a) => a.toLowerCase()));
    savePatch(
      { screenshot_skip_apps: skipApps.filter((a) => !drop.has(a.toLowerCase())) },
      t("skipApps.saved"),
    );
  }

  return (
    <div className="ad-wrap" style={{ paddingBottom: 32 }}>
      <div className="ad-pagehead">
        <div className="ad-pagehead__main">
          <h1 className="ad-h1">{t("title")}</h1>
          {selected && (
            <p className="ad-sub">
              <Trans
                t={t}
                i18nKey="scope"
                values={{ name: selected.name, members: terms.many }}
                components={[<strong />]}
              />
            </p>
          )}
        </div>
      </div>

      {loading && <Spinner label={t("loading")} />}

      {!loading && businesses.length === 0 && <Empty>{t("noBusinesses")}</Empty>}

      {selected && (
        <>
          <div className="ad-set-sec">{t("sections.capture")}</div>
          <div className="set-group">
            <div className="set-row">
              <div>
                <div className="set-title">{t("capturePolicy.title")}</div>
                <div className="set-desc">{t("capturePolicy.desc", { members: terms.many })}</div>
              </div>
              <div
                className="segmented"
                role="group"
                aria-label={t("capturePolicy.ariaLabel", { member: terms.lowerOne })}
              >
                <button
                  className={!selected.allow_employee_override ? "active" : ""}
                  disabled={saving}
                  onClick={() => savePatch({ allow_employee_override: false }, t("capturePolicy.savedLocked", { members: terms.many }))}
                >
                  {t("capturePolicy.locked")}
                </button>
                <button
                  className={selected.allow_employee_override ? "active" : ""}
                  disabled={saving}
                  onClick={() => savePatch({ allow_employee_override: true }, t("capturePolicy.savedAllowed", { members: terms.many }))}
                >
                  {t("capturePolicy.allowOverride")}
                </button>
              </div>
            </div>

            <div className="set-row">
              <div>
                <div className="set-title">{t("screenshotUpload.title")}</div>
                <div className="set-desc">{t("screenshotUpload.desc", { members: terms.many })}</div>
              </div>
              <div
                className="segmented"
                role="group"
                aria-label={t("screenshotUpload.ariaLabel")}
              >
                <button
                  className={selected.screenshot_upload ? "active" : ""}
                  disabled={saving}
                  onClick={() => savePatch({ screenshot_upload: true }, t("screenshotUpload.savedOn"))}
                >
                  {t("screenshotUpload.upload")}
                </button>
                <button
                  className={!selected.screenshot_upload ? "active" : ""}
                  disabled={saving}
                  onClick={() => savePatch({ screenshot_upload: false }, t("screenshotUpload.savedOff", { members: terms.many }))}
                >
                  {t("screenshotUpload.localOnly")}
                </button>
              </div>
            </div>

            <div className="set-row">
              <div>
                <div className="set-title">{t("screenshotMode.title")}</div>
                <div className="set-desc">{t("screenshotMode.desc")}</div>
              </div>
              <div role="radiogroup" aria-label={t("screenshotMode.ariaLabel")} style={{ display: "grid", gap: 8, width: 380, maxWidth: "100%" }}>
                <ModeOption
                  label={t("screenshotMode.privacy")}
                  desc={t("screenshotMode.privacyDesc")}
                  selected={normalizeMode(selected.screenshot_mode) === "privacy"}
                  disabled={saving}
                  onSelect={() => saveMode("privacy")}
                />
                <ModeOption
                  label={t("screenshotMode.normal")}
                  desc={t("screenshotMode.normalDesc")}
                  selected={normalizeMode(selected.screenshot_mode) === "normal"}
                  disabled={saving}
                  onSelect={() => saveMode("normal")}
                />
              </div>
            </div>

            {normalizeMode(selected.screenshot_mode) === "privacy" && (
              <div className="set-row">
                <div>
                  <div className="set-title">{t("skipApps.title")}</div>
                  <div className="set-desc">{t("skipApps.desc")}</div>
                </div>
                <div className="toolbar" style={{ gap: 10 }}>
                  <span className="muted">{t("skipApps.count", { count: skipApps.length })}</span>
                  <button className="bibo-btn bibo-btn--secondary bibo-btn--sm" disabled={saving} onClick={() => setSkipOpen(true)}>
                    {t("skipApps.manage")}
                  </button>
                </div>
              </div>
            )}

            <div className="set-row">
              <div>
                <div className="set-title">{t("screenshotInterval.title")}</div>
              </div>
              <div className="segmented" role="group" aria-label={t("screenshotInterval.ariaLabel")}>
                {INTERVAL_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    className={selected.screenshot_interval_s === p.value ? "active" : ""}
                    disabled={saving}
                    onClick={() => savePatch({ screenshot_interval_s: p.value }, t("screenshotInterval.saved"))}
                  >
                    {t("presets.min", { count: p.minutes })}
                  </button>
                ))}
              </div>
            </div>

            <div className="set-row">
              <div>
                <div className="set-title">{t("idleThreshold.title")}</div>
              </div>
              <div className="segmented" role="group" aria-label={t("idleThreshold.ariaLabel")}>
                {IDLE_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    className={selected.idle_threshold_s === p.value ? "active" : ""}
                    disabled={saving}
                    onClick={() => savePatch({ idle_threshold_s: p.value }, t("idleThreshold.saved"))}
                  >
                    {t("presets.min", { count: p.minutes })}
                  </button>
                ))}
              </div>
            </div>
            <div className="set-row">
              <div>
                <div className="set-title">{t("retention.title")}</div>
              </div>
              <div className="segmented" role="group" aria-label={t("retention.ariaLabel")}>
                {PRESETS.map((p) => (
                  <button
                    key={p.days ?? "never"}
                    className={retention === p.value ? "active" : ""}
                    disabled={saving}
                    onClick={() => saveRetention(p.value)}
                  >
                    {p.days === null ? t("presets.never") : t("presets.days", { count: p.days })}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="ad-set-sec">{t("sections.storage")}</div>
          <div className="set-group">
            <div className="set-row">
              <div>
                <div className="set-title">{t("cleanup.title")}</div>
                <div className="set-desc">{t("cleanup.desc", { name: selected.name })}</div>
              </div>
              <button className="bibo-btn bibo-btn--secondary bibo-btn--sm" disabled={cleaning} onClick={() => setConfirmOpen(true)}>
                <span style={{ display: "inline-flex", lineHeight: 0 }}>{IconTrash}</span>
                <span>{t("cleanup.button")}</span>
              </button>
            </div>
          </div>

          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        </>
      )}

      {skipOpen && selected && (
        <Modal title={t("skipApps.modalTitle")} onClose={() => setSkipOpen(false)}>
          <p className="muted" style={{ marginTop: 0 }}>{t("skipApps.desc")}</p>

          <div className="toolbar" style={{ gap: 8, marginBottom: 12 }}>
            <input
              className="input"
              value={skipAppInput}
              placeholder={t("skipApps.placeholder")}
              disabled={saving}
              autoFocus
              onChange={(e) => setSkipAppInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSkipApp();
                }
              }}
            />
            <button className="bibo-btn bibo-btn--secondary bibo-btn--sm" disabled={saving || !skipAppInput.trim()} onClick={() => addSkipApp()}>
              {t("skipApps.add")}
            </button>
          </div>

          {customSkipApps.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{t("skipApps.custom")}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {customSkipApps.map((a) => (
                  <span key={a} className="pill">
                    {a}
                    <button
                      type="button"
                      disabled={saving}
                      aria-label={t("skipApps.remove", { name: a })}
                      onClick={() => removeSkipApps([a])}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "inherit",
                        padding: "0 2px",
                        marginLeft: 4,
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {privacyApps.map((cat) => {
              const added = cat.apps.filter(hasSkipApp);
              return (
                <div key={cat.key} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
                      {t(`skipApps.cat${cat.key}`)} ({added.length}/{cat.apps.length})
                    </span>
                    {added.length < cat.apps.length && (
                      <button
                        className="bibo-btn bibo-btn--ghost"
                        style={{ padding: "1px 8px", fontSize: 11 }}
                        disabled={saving}
                        onClick={() => addSkipApps(cat.apps)}
                      >
                        {t("skipApps.addAll")}
                      </button>
                    )}
                    {added.length > 0 && (
                      <button
                        className="bibo-btn bibo-btn--ghost"
                        style={{ padding: "1px 8px", fontSize: 11 }}
                        disabled={saving}
                        onClick={() => removeSkipApps(cat.apps)}
                      >
                        {t("skipApps.removeAll")}
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
                          disabled={saving}
                          style={{
                            font: "inherit",
                            padding: "2px 10px",
                            fontSize: 12,
                            borderRadius: 999,
                            cursor: "pointer",
                            color: "inherit",
                            border: on ? "1px solid var(--accent)" : "1px solid var(--border)",
                            background: on ? "var(--accent-weak)" : "transparent",
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

          <div className="toolbar" style={{ justifyContent: "flex-end", marginTop: 12 }}>
            <button className="bibo-btn bibo-btn--primary" onClick={() => setSkipOpen(false)}>
              {t("skipApps.done")}
            </button>
          </div>
        </Modal>
      )}

      {confirmOpen && selected && (
        <Modal title={t("cleanup.modalTitle")} onClose={() => setConfirmOpen(false)}>
          <p className="muted" style={{ marginTop: 0 }}>
            <Trans
              t={t}
              i18nKey="cleanup.olderThanIntro"
              values={{ name: selected.name }}
              components={[<strong />]}
            />
          </p>
          <div className="segmented" role="group" aria-label={t("cleanup.olderThanAriaLabel")} style={{ marginBottom: 16 }}>
            {CLEANUP_PRESETS.map((d) => (
              <button
                key={d}
                className={cleanupDays === d ? "active" : ""}
                onClick={() => setCleanupDays(d)}
              >
                {t("presets.days", { count: d })}
              </button>
            ))}
          </div>
          <p className="muted">{t("cleanup.warning", { days: cleanupDays })}</p>
          <div className="toolbar" style={{ justifyContent: "flex-end", gap: 8 }}>
            <button className="bibo-btn bibo-btn--secondary" disabled={cleaning} onClick={() => setConfirmOpen(false)}>
              {t("cleanup.cancel")}
            </button>
            <button className="bibo-btn bibo-btn--primary" disabled={cleaning} onClick={runCleanup}>
              {cleaning ? t("cleanup.deleting") : t("cleanup.delete", { days: cleanupDays })}
            </button>
          </div>
        </Modal>
      )}

      <div className="ad-set-sec">{t("sections.account")}</div>
      <div className="set-group">
        <div className="set-row">
          <div className="set-title">{t("account.email")}</div>
          <div className="ad-readonly">{user?.email || user?.username}</div>
        </div>
        <div className="set-row">
          <div className="set-title">{t("account.displayName")}</div>
          <div className="ad-readonly">{user?.display_name || user?.username}</div>
        </div>
      </div>
    </div>
  );
}
