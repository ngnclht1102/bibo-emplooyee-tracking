import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";
import { useTheme, type ThemeMode } from "../theme/ThemeProvider";
import { useBusinesses } from "../useBusinesses";
import { memberTerms } from "../terms";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function AppShell() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { mode, setMode } = useTheme();
  const { selected } = useBusinesses();
  const terms = memberTerms(selected?.kind);

  const NAV = [
    { to: "/", label: t("nav.dashboard"), end: true },
    { to: "/employees", label: terms.many, end: false },
    { to: "/settings", label: t("nav.settings"), end: false },
  ];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="dot" /> BiBoEmployeeTracking
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
            <div className="segmented" role="group" aria-label={t("language")}>
              {(["light", "dark", "system"] as ThemeMode[]).map((m) => (
                <button
                  key={m}
                  className={m === mode ? "active" : ""}
                  onClick={() => setMode(m)}
                >
                  {m === "light" ? t("theme.light") : m === "dark" ? t("theme.dark") : t("theme.auto")}
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <LanguageSwitcher />
          </div>
          <div style={{ marginBottom: 4 }}>{user?.display_name ?? user?.email}</div>
          <button className="link-row" onClick={logout}>
            {t("actions.signOut")}
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
