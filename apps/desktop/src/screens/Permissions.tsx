import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
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

export function Permissions() {
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
