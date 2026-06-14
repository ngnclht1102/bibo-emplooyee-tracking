import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Segmented } from "./ui";
import { Dashboard } from "./screens/Dashboard";
import { Permissions } from "./screens/Permissions";
import { Screenshots } from "./screens/Screenshots";
import { Browser } from "./screens/Browser";
import { Activity } from "./screens/Activity";
import { Settings, type AppSettings } from "./screens/Settings";

type Screen =
  | "Dashboard"
  | "Activity"
  | "Screenshots"
  | "Browser"
  | "Permissions"
  | "Settings";

const NAV: Screen[] = [
  "Dashboard",
  "Activity",
  "Screenshots",
  "Browser",
  "Permissions",
  "Settings",
];

function applyTheme(mode: string) {
  const root = document.documentElement;
  if (mode.toLowerCase() === "system") {
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.setAttribute("data-theme", dark ? "dark" : "light");
  } else {
    root.setAttribute("data-theme", mode.toLowerCase());
  }
}

type TrackStatus = "tracking" | "idle" | "paused";

function App() {
  const [screen, setScreen] = useState<Screen>("Dashboard");
  const [status, setStatus] = useState<TrackStatus>("tracking");
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    invoke<TrackStatus>("tracking_state").then(setStatus).catch(() => {});
    invoke<AppSettings>("get_settings").then(setSettings).catch(() => {});
    // The tray broadcasts tracking / idle / paused — keep the pill in sync with it.
    const unlisten = listen<TrackStatus>("tracking-state", (e) => setStatus(e.payload));
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const theme = settings?.theme ?? "System";
  useEffect(() => {
    applyTheme(theme);
    if (theme.toLowerCase() !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("System");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  async function updateSettings(patch: Partial<AppSettings>) {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      await invoke("set_settings", { value: next });
    } catch {
      /* keep optimistic value; will reconcile on next load */
    }
  }

  async function toggleTracking() {
    // Paused -> resume; tracking or idle -> pause.
    const pause = status !== "paused";
    const prev = status;
    setStatus(pause ? "paused" : "tracking");
    try {
      await invoke("set_paused", { paused: pause });
    } catch {
      setStatus(prev);
    }
  }

  const pillClass =
    status === "paused" ? "pill-danger" : status === "idle" ? "pill-warn" : "pill-success";
  const pillContent =
    status === "paused" ? (
      "❚❚ Paused"
    ) : status === "idle" ? (
      <>🟡 Idle</>
    ) : (
      <>
        <span className="dot" /> Tracking
      </>
    );
  const pillTitle =
    status === "paused"
      ? "Tracking paused — click to resume"
      : status === "idle"
        ? "Idle — no recent input, not counting. Click to pause."
        : "Tracking — click to pause";

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="dot" /> Employee Tracker
        </div>
        {NAV.map((n) => (
          <div
            key={n}
            className={`nav-item ${screen === n ? "active" : ""}`}
            onClick={() => setScreen(n)}
          >
            {n}
          </div>
        ))}
      </aside>

      <div className="main">
        <header className="header">
          <h1>{screen}</h1>
          <div className="row">
            <Segmented
              options={["Light", "Dark", "System"]}
              value={theme}
              onChange={(v) => updateSettings({ theme: v })}
            />
            <button
              className={`pill ${pillClass}`}
              onClick={toggleTracking}
              style={{ cursor: "pointer", background: "transparent" }}
              title={pillTitle}
            >
              {pillContent}
            </button>
          </div>
        </header>

        <main className="content">
          {screen === "Dashboard" && <Dashboard />}
          {screen === "Activity" && <Activity />}
          {screen === "Screenshots" && <Screenshots />}
          {screen === "Browser" && <Browser />}
          {screen === "Permissions" && <Permissions />}
          {screen === "Settings" && (
            <Settings
              settings={settings}
              onChange={updateSettings}
              onOpenPermissions={() => setScreen("Permissions")}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
