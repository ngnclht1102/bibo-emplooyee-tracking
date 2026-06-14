import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Pill } from "../ui";

type Status = "granted" | "denied" | "needs_restart";
type PermKey = "accessibility" | "input_monitoring" | "screen_recording";

type Perms = {
  accessibility: Status;
  input_monitoring: Status;
  screen_recording: Status;
};

const META: { key: PermKey; name: string; purpose: string }[] = [
  {
    key: "accessibility",
    name: "Accessibility",
    purpose: "Window titles & keyboard activity",
  },
  {
    key: "input_monitoring",
    name: "Input Monitoring",
    purpose: "Counting keypresses — counts only, never the keys",
  },
  {
    key: "screen_recording",
    name: "Screen Recording",
    purpose: "Periodic screenshots",
  },
];

function Indicator({ status }: { status: Status }) {
  if (status === "granted") return <span style={{ color: "var(--success)" }}>●</span>;
  return <span style={{ color: "var(--danger)" }}>▲</span>;
}

function Action({
  status,
  permKey,
  onOpen,
  onRequest,
}: {
  status: Status;
  permKey: PermKey;
  onOpen: (k: PermKey) => void;
  onRequest: () => void;
}) {
  if (status === "granted") return <Pill kind="success">● Granted</Pill>;
  if (status === "needs_restart")
    return <button className="btn">Quit & Reopen</button>;
  // Screen Recording can show a real OS prompt the first time.
  if (permKey === "screen_recording") {
    return (
      <div className="row" style={{ gap: 8 }}>
        <button className="btn" onClick={onRequest}>
          Request
        </button>
        <button className="btn btn-primary" onClick={() => onOpen(permKey)}>
          Open Settings →
        </button>
      </div>
    );
  }
  return (
    <button className="btn btn-primary" onClick={() => onOpen(permKey)}>
      Open Settings →
    </button>
  );
}

export function Permissions() {
  const [perms, setPerms] = useState<Perms | null>(null);

  const refresh = async () => {
    try {
      setPerms(await invoke<Perms>("permissions_status"));
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

  const openSettings = (which: PermKey) =>
    invoke("open_permission_settings", { which }).catch(() => {});
  const requestScreen = () =>
    invoke("request_screen_recording").then(refresh).catch(() => {});

  const rows = perms
    ? META.map((m) => ({ ...m, status: perms[m.key] }))
    : META.map((m) => ({ ...m, status: "denied" as Status }));
  const granted = rows.filter((r) => r.status === "granted").length;

  return (
    <div style={{ maxWidth: 640 }}>
      <p className="muted" style={{ marginTop: 0 }}>
        Employee Tracker needs these macOS permissions to work. Status updates automatically.
      </p>

      <div className="set-group">
        {rows.map((r) => (
          <div className="set-row" key={r.key}>
            <div className="row" style={{ gap: 12 }}>
              <Indicator status={r.status} />
              <div>
                <div className="set-title">{r.name}</div>
                <div className="set-desc">{r.purpose}</div>
              </div>
            </div>
            <Action
              status={r.status}
              permKey={r.key}
              onOpen={openSettings}
              onRequest={requestScreen}
            />
          </div>
        ))}
      </div>

      <div className="row spread" style={{ marginTop: 16 }}>
        <span className="muted" style={{ fontSize: 12 }}>
          {granted} of {rows.length} granted · Re-checks automatically
        </span>
        <button className="btn btn-ghost" onClick={refresh}>
          Re-check
        </button>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        ⓘ Some permissions require quitting & reopening the app to take effect.
      </div>
    </div>
  );
}
