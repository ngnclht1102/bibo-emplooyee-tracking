import { useState } from "react";

/**
 * Chrome/Edge extension popup (Manifest V3).
 * Shown when the user clicks the toolbar icon. ~340px wide.
 * Mirrors the app's flat token styling.
 */
export function Popup() {
  const [tracking, setTracking] = useState(true);
  const connected = true;

  return (
    <div className="popup-frame">
      <div className="popup-head">
        <div className="row" style={{ gap: 8 }}>
          <span className="dot" /> <strong>ctracking</strong>
        </div>
        <span className={`pill pill-${connected ? "success" : "danger"}`}>
          {connected ? "● Connected" : "▲ App not found"}
        </span>
      </div>

      <div className="popup-body">
        <div className="row spread">
          <div>
            <div className="set-title">Track this browser</div>
            <div className="set-desc">Reports active tab to the local app</div>
          </div>
          <button
            className={`switch ${tracking ? "" : "off"}`}
            onClick={() => setTracking((v) => !v)}
          />
        </div>

        <div className="card" style={{ padding: 12 }}>
          <div className="set-desc" style={{ marginBottom: 4 }}>
            Current page
          </div>
          <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            ctracking · Pull requests
          </div>
          <div className="muted num" style={{ fontSize: 12 }}>
            github.com · 4m 12s
          </div>
        </div>

        <div className="row spread">
          <div className="card" style={{ padding: "8px 12px", flex: 1, marginRight: 8 }}>
            <div className="set-desc">Pages today</div>
            <div className="num" style={{ fontSize: 18, fontWeight: 600 }}>
              47
            </div>
          </div>
          <div className="card" style={{ padding: "8px 12px", flex: 1 }}>
            <div className="set-desc">App port</div>
            <div className="num" style={{ fontSize: 18, fontWeight: 600 }}>
              47615
            </div>
          </div>
        </div>

        <div className="muted" style={{ fontSize: 11 }}>
          🔒 Only the active tab URL & time are sent — to 127.0.0.1 on your machine.
        </div>
      </div>
    </div>
  );
}

export function ExtensionPreview() {
  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        Browser extension popup (Manifest V3). Click the toolbar icon to open.
      </p>
      <div
        style={{
          display: "flex",
          gap: 32,
          flexWrap: "wrap",
          alignItems: "flex-start",
          padding: 24,
          background: "var(--bg-subtle)",
          border: "1px solid var(--border)",
          borderRadius: 8,
        }}
      >
        <div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            Connected
          </div>
          <Popup />
        </div>
        <div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            States: connected / paused / app-not-found are toggled via the switch & status pill.
          </div>
        </div>
      </div>
    </div>
  );
}
