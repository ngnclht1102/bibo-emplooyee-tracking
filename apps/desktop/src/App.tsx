import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Segmented } from "./ui";
import { Dashboard } from "./screens/Dashboard";
import { Permissions } from "./screens/Permissions";
import { Screenshots } from "./screens/Screenshots";
import { Browser } from "./screens/Browser";
import { Activity } from "./screens/Activity";
import { Settings } from "./screens/Settings";

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

type ThemeMode = "Light" | "Dark" | "System";

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === "System") {
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.setAttribute("data-theme", dark ? "dark" : "light");
  } else {
    root.setAttribute("data-theme", mode.toLowerCase());
  }
}

function App() {
  const [screen, setScreen] = useState<Screen>("Dashboard");
  const [theme, setTheme] = useState<ThemeMode>("System");
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    invoke<boolean>("is_paused").then(setPaused).catch(() => {});
  }, []);

  async function toggleTracking() {
    const next = !paused;
    setPaused(next);
    try {
      await invoke("set_paused", { paused: next });
    } catch {
      setPaused(!next); // revert on failure
    }
  }

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "System") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("System");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="dot" /> ctracking
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
              onChange={(v) => setTheme(v as ThemeMode)}
            />
            <button
              className={`pill ${paused ? "pill-danger" : "pill-success"}`}
              onClick={toggleTracking}
              style={{ cursor: "pointer", background: "transparent" }}
              title={paused ? "Tracking paused — click to resume" : "Tracking — click to pause"}
            >
              {paused ? "❚❚ Paused" : <><span className="dot" /> Tracking</>}
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
            <Settings onOpenPermissions={() => setScreen("Permissions")} />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
