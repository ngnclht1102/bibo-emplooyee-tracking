import { useEffect, useState, type ReactElement } from "react";
import { call as invoke } from "../api";
import { useTranslation } from "react-i18next";

type Status = "granted" | "denied" | "needs_restart";

// One row from the per-OS, data-driven `permissions_status` command (see docs/12 §2).
// macOS yields the 3 TCC rows; Windows yields capture/consent rows.
type Cap = {
  key: string;
  label: string;
  description: string;
  state: Status;
  required: boolean;
  can_request: boolean;
  can_open_settings: boolean;
};

/* Per-capability icons (shared by the compact onboarding list and the full screen). */
const MonitorIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
  </svg>
);
const KeyboardIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
  </svg>
);
const AccessibilityIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="16" cy="4" r="1" />
    <path d="m18 19 1-7-6 1" />
    <path d="m5 8 3-3 5.5 3-2.36 3.5" />
    <path d="M4.24 14.5a5 5 0 0 0 6.88 6" />
    <path d="M13.76 17.5a5 5 0 0 0-6.88-6" />
  </svg>
);
const ShieldIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3l8 3v5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" /><path d="M9 12l2 2 4-4" />
  </svg>
);
const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </svg>
);
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
const CAP_ICON: Record<string, () => ReactElement> = {
  screen_recording: MonitorIcon,
  input_monitoring: KeyboardIcon,
  accessibility: AccessibilityIcon,
};

const REQUEST_CMD: Record<string, string> = {
  screen_recording: "request_screen_recording",
  input_monitoring: "request_input_monitoring",
  accessibility: "request_accessibility",
};

// Render order for the rows (matches the design); unknown keys sink to the end.
const ORDER = ["screen_recording", "input_monitoring", "accessibility"];
const rank = (k: string) => (ORDER.indexOf(k) === -1 ? 99 : ORDER.indexOf(k));

/* Full-screen action: a Granted/Off badge or a Request/Open-Settings button. */
function Action({
  cap,
  onOpen,
  onRequest,
}: {
  cap: Cap;
  onOpen: (k: string) => void;
  onRequest: (k: string) => void;
}) {
  const { t } = useTranslation("permissions");
  if (cap.state === "granted")
    return (
      <span className="bibo-badge bibo-badge--positive">
        <CheckIcon />
        {t("granted")}
      </span>
    );
  if (cap.state === "needs_restart")
    return <button className="bibo-btn bibo-btn--secondary bibo-btn--sm">{t("quitReopen")}</button>;

  // Not granted: a single Request button — it triggers the OS prompt, or opens
  // System Settings where a direct request isn't available.
  if (cap.can_request || cap.can_open_settings)
    return (
      <button
        className="bibo-btn bibo-btn--secondary bibo-btn--sm"
        onClick={() => (cap.can_request ? onRequest(cap.key) : onOpen(cap.key))}
      >
        <span>{t("request")}</span>
      </button>
    );

  // No OS action available (e.g. Windows capture rows): reflect the off state; the
  // user enables it via the consent flow / Settings opt-outs.
  return <span className="bibo-badge bibo-badge--negative">{t("off")}</span>;
}

/* Compact action for the onboarding step: a single Request/Open/Granted control. */
function CompactAction({
  cap,
  onOpen,
  onRequest,
}: {
  cap: Cap;
  onOpen: (k: string) => void;
  onRequest: (k: string) => void;
}) {
  const { t } = useTranslation("permissions");
  if (cap.state === "granted")
    return (
      <span className="perm-granted">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 6 9 17l-5-5" />
        </svg>
        {t("granted")}
      </span>
    );
  if (cap.state === "needs_restart")
    return <button className="perm-request">{t("quitReopen")}</button>;
  if (cap.can_request)
    return (
      <button className="perm-request" onClick={() => onRequest(cap.key)}>
        {t("request")}
      </button>
    );
  if (cap.can_open_settings)
    return (
      <button className="perm-request" onClick={() => onOpen(cap.key)}>
        {t("openSettings")}
      </button>
    );
  return <span className="perm-granted perm-off">{t("off")}</span>;
}

export function Permissions({ compact = false }: { compact?: boolean } = {}) {
  const { t } = useTranslation("permissions");
  const [caps, setCaps] = useState<Cap[] | null>(null);

  const refresh = async () => {
    try {
      setCaps(await invoke<Cap[]>("permissions_status"));
    } catch {
      /* ignore transient errors */
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 1500);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const openSettings = (which: string) =>
    invoke("open_permission_settings", { which }).catch(() => {});
  const request = (which: string) => {
    const cmd = REQUEST_CMD[which];
    if (cmd) invoke(cmd).then(refresh).catch(() => {});
  };

  const rows = caps ?? [];

  // Compact layout for the onboarding step: icon + label + a single action, no
  // intro/summary chrome (those live on the full Settings → Permissions screen).
  if (compact) {
    const orderedRows = [...rows].sort((a, b) => rank(a.key) - rank(b.key));
    return (
      <div className="perm-list">
        {orderedRows.map((r) => {
          const Ic = CAP_ICON[r.key] ?? ShieldIcon;
          return (
            <div className="perm-row" key={r.key}>
              <span className="perm-ic"><Ic /></span>
              <span className="perm-label">
                {t(`caps.${r.key}.label`, { defaultValue: r.label })}
              </span>
              <CompactAction cap={r} onOpen={openSettings} onRequest={request} />
            </div>
          );
        })}
      </div>
    );
  }

  const orderedRows = [...rows].sort((a, b) => rank(a.key) - rank(b.key));

  return (
    <div className="bibo-card bibo-card--default bb-card-pad">
      <div className="bb-panel__head">
        <div>
          <div className="bb-panel__title">{t("title")}</div>
          <div className="bb-panel__sub">{t("intro")}</div>
        </div>
        <span style={{ marginLeft: "auto" }}>
          <button className="bibo-btn bibo-btn--ghost bibo-btn--sm" onClick={refresh}>
            <span style={{ display: "inline-flex", lineHeight: 0 }}>
              <RefreshIcon />
            </span>
            <span>{t("recheck")}</span>
          </button>
        </span>
      </div>

      {orderedRows.map((r) => {
        const Ic = CAP_ICON[r.key] ?? ShieldIcon;
        return (
          <div className="bb-perm" key={r.key}>
            <div className="bb-perm__ic">
              <Ic />
            </div>
            <div className="bb-perm__main">
              <div className="bb-perm__title">
                <span className={`bb-perm__status ${r.state === "granted" ? "ok" : "no"}`} />
                {t(`caps.${r.key}.label`, { defaultValue: r.label })}
              </div>
              <div className="bb-perm__desc">
                {t(`caps.${r.key}.description`, { defaultValue: r.description })}
              </div>
            </div>
            <div className="bb-perm__act">
              <Action cap={r} onOpen={openSettings} onRequest={request} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
