import { useEffect, useState, type ReactElement } from "react";
import { call as invoke } from "../api";
import { useTranslation } from "react-i18next";
import { Pill } from "../ui";

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

function Indicator({ status }: { status: Status }) {
  if (status === "granted") return <span style={{ color: "var(--success)" }}>●</span>;
  return <span style={{ color: "var(--danger)" }}>▲</span>;
}

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
  if (cap.state === "granted") return <Pill kind="success">● {t("granted")}</Pill>;
  if (cap.state === "needs_restart") return <button className="btn">{t("quitReopen")}</button>;

  const buttons = [];
  if (cap.can_request)
    buttons.push(
      <button className="btn" key="req" onClick={() => onRequest(cap.key)}>
        {t("request")}
      </button>,
    );
  if (cap.can_open_settings)
    buttons.push(
      <button className="btn btn-primary" key="open" onClick={() => onOpen(cap.key)}>
        {t("openSettings")}
      </button>,
    );

  // No OS action available (e.g. Windows capture rows): reflect the off state; the
  // user enables it via the consent flow / Settings opt-outs.
  if (buttons.length === 0) return <Pill kind="danger">▲ {t("off")}</Pill>;
  return (
    <div className="row" style={{ gap: 8 }}>
      {buttons}
    </div>
  );
}

const REQUEST_CMD: Record<string, string> = {
  screen_recording: "request_screen_recording",
  input_monitoring: "request_input_monitoring",
  accessibility: "request_accessibility",
};

/* Per-capability icons for the compact (onboarding) layout. */
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
const CAP_ICON: Record<string, () => ReactElement> = {
  screen_recording: MonitorIcon,
  input_monitoring: KeyboardIcon,
  accessibility: AccessibilityIcon,
};

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
  const granted = rows.filter((r) => r.state === "granted").length;
  // The "quit & reopen / Settings" note only applies where the OS has deep links.
  const hasOsActions = rows.some((r) => r.can_open_settings);

  // Compact layout for the onboarding step: icon + label + a single action, no
  // intro/summary chrome (those live on the full Settings → Permissions screen).
  if (compact) {
    const order = ["screen_recording", "input_monitoring", "accessibility"];
    const rank = (k: string) => (order.indexOf(k) === -1 ? 99 : order.indexOf(k));
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

  return (
    <div style={{ maxWidth: 640 }}>
      <p className="muted" style={{ marginTop: 0 }}>
        {t("intro")}
      </p>

      <div className="set-group">
        {rows.map((r) => (
          <div className="set-row" key={r.key}>
            <div className="row" style={{ gap: 12 }}>
              <Indicator status={r.state} />
              <div>
                <div className="set-title">{t(`caps.${r.key}.label`, { defaultValue: r.label })}</div>
                <div className="set-desc">
                  {t(`caps.${r.key}.description`, { defaultValue: r.description })}
                </div>
              </div>
            </div>
            <Action cap={r} onOpen={openSettings} onRequest={request} />
          </div>
        ))}
      </div>

      <div className="row spread" style={{ marginTop: 16 }}>
        <span className="muted" style={{ fontSize: 12 }}>
          {t("summary", { granted, total: rows.length })}
        </span>
        <button className="btn btn-ghost" onClick={refresh}>
          {t("recheck")}
        </button>
      </div>
      {hasOsActions && (
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          ⓘ {t("restartNote")}
        </div>
      )}
    </div>
  );
}
