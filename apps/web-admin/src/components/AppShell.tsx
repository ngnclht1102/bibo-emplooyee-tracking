import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useTheme, type ThemeMode } from "../theme/ThemeProvider";

const NAV = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/employees", label: "Employees", end: false },
  { to: "/settings", label: "Settings", end: false },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const { mode, setMode } = useTheme();

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="dot" /> ctracking
        </div>
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
          >
            {n.label}
          </NavLink>
        ))}

        <div className="sidebar-foot">
          <div style={{ marginBottom: 8 }}>
            <div className="segmented" role="group" aria-label="Theme">
              {(["light", "dark", "system"] as ThemeMode[]).map((m) => (
                <button
                  key={m}
                  className={m === mode ? "active" : ""}
                  onClick={() => setMode(m)}
                  title={`Theme: ${m}`}
                >
                  {m === "light" ? "Light" : m === "dark" ? "Dark" : "Auto"}
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 4 }}>{user?.display_name ?? user?.email}</div>
          <button className="link-row" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
