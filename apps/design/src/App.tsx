import { useEffect, useState } from "react";
import { Segmented } from "./ui";
import { Dashboard } from "./screens/Dashboard";
import { Permissions } from "./screens/Permissions";
import { Screenshots } from "./screens/Screenshots";
import { Browser } from "./screens/Browser";
import { Activity } from "./screens/Activity";
import { Settings } from "./screens/Settings";
import { ExtensionPreview } from "./extension/Popup";

type Screen =
  | "Dashboard"
  | "Activity"
  | "Screenshots"
  | "Browser"
  | "Permissions"
  | "Settings"
  | "Extension";

const NAV: Screen[] = [
  "Dashboard",
  "Activity",
  "Screenshots",
  "Browser",
  "Permissions",
  "Settings",
  "Extension",
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

export function App() {
  const [screen, setScreen] = useState<Screen>("Dashboard");
  const [theme, setTheme] = useState<ThemeMode>("System");

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
            <span className="muted" style={{ fontSize: 12 }}>
              Sun, Jun 14
            </span>
            <Segmented
              options={["Light", "Dark", "System"]}
              value={theme}
              onChange={(v) => setTheme(v as ThemeMode)}
            />
            <span className="pill pill-success">
              <span className="dot" /> Tracking
            </span>
          </div>
        </header>

        <main className="content">
          {screen === "Dashboard" && <Dashboard />}
          {screen === "Activity" && <Activity />}
          {screen === "Screenshots" && <Screenshots />}
          {screen === "Browser" && <Browser />}
          {screen === "Permissions" && <Permissions />}
          {screen === "Settings" && <Settings onOpenPermissions={() => setScreen("Permissions")} />}
          {screen === "Extension" && <ExtensionPreview />}
        </main>
      </div>
    </div>
  );
}
