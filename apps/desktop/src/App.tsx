import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { call as invoke } from "./api";
import { Sentry } from "./sentry";
import { autoCheckAndPrompt } from "./updater";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { track } from "./analytics";
import { useTranslation } from "react-i18next";
import { Segmented } from "./ui";
import { Dashboard } from "./screens/Dashboard";
import { Permissions } from "./screens/Permissions";
import { Screenshots } from "./screens/Screenshots";
import { Browser } from "./screens/Browser";
import { Activity } from "./screens/Activity";
import { Settings, type AppSettings, type CaptureManaged } from "./screens/Settings";
import { Login, type Session } from "./screens/Login";
import { Welcome } from "./screens/Welcome";
import { Onboarding } from "./screens/Onboarding";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { AppTrayMenu } from "./components/AppTrayMenu";

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

/* ---- sidebar icons (stroke = currentColor, so they follow the nav item color) ---- */
const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;
const GridIcon = () => (
  <svg {...svgProps} aria-hidden>
    <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" />
  </svg>
);
const ActivityIcon = () => (
  <svg {...svgProps} aria-hidden><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
);
const CameraNavIcon = () => (
  <svg {...svgProps} aria-hidden>
    <path d="M14.5 4h-5L8 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-4z" /><circle cx="12" cy="13" r="3.2" />
  </svg>
);
const GlobeNavIcon = () => (
  <svg {...svgProps} aria-hidden>
    <circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a13 13 0 0 1 0 18 13 13 0 0 1 0-18" />
  </svg>
);
const ShieldNavIcon = () => (
  <svg {...svgProps} aria-hidden><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /><path d="M9 12l2 2 4-4" /></svg>
);
const GearIcon = () => (
  <svg {...svgProps} aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);
const HardDriveIcon = () => (
  <svg {...svgProps} aria-hidden>
    <path d="M10 16h.01" />
    <path d="M2.212 11.577a2 2 0 0 0-.212.896V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5.527a2 2 0 0 0-.212-.896L18.55 5.11A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    <path d="M21.946 12.013H2.054" />
    <path d="M6 16h.01" />
  </svg>
);
const UserIcon = () => (
  <svg {...svgProps} aria-hidden><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
);
const NAV_ICON: Record<Screen, () => ReactElement> = {
  Dashboard: GridIcon,
  Activity: ActivityIcon,
  Screenshots: CameraNavIcon,
  Browser: GlobeNavIcon,
  Permissions: ShieldNavIcon,
  Settings: GearIcon,
};

/* pause glyph shown inside the header tracking pill when paused ("❚❚ Paused") */
const PauseBars = () => (
  <svg className="bb-trackpill__glyph" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </svg>
);

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
  const { t, i18n } = useTranslation();
  const [screen, setScreen] = useState<Screen>("Dashboard");
  const [status, setStatus] = useState<TrackStatus>("tracking");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [captureManaged, setCaptureManaged] = useState<CaptureManaged | null>(null);
  // undefined = still checking; null = logged out; Session = logged in.
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  // Whether the user clicked "I have an account" on the welcome screen.
  const [showLogin, setShowLogin] = useState(false);
  // Installed app version (from tauri.conf.json), shown under the sidebar brand.
  const [version, setVersion] = useState<string>("");
  // Latest screen, readable from the (mount-once) analytics click listener.
  const screenRef = useRef(screen);
  screenRef.current = screen;

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  // Product analytics (ticket 133): UI clicks → Aptabase. (`app_active` is emitted
  // natively in Rust on WindowEvent::Focused — the webview doesn't get reliable native
  // focus events.) Delegated listener: any button or sidebar nav item, by its text.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.("button, .nav-item");
      if (!el) return;
      const label = (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40);
      track("ui_click", { label, screen: screenRef.current });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    invoke<Session | null>("current_session")
      .then((s) => setSession(s ?? null))
      .catch(() => setSession(null));
    // Settings are local (no auth) — load them up front so the welcome/personal
    // gate can read `local_only` before any login.
    invoke<AppSettings>("get_settings").then(setSettings).catch(() => {});
    // Sync the native side (tray) to the UI's detected/saved language on startup.
    invoke("set_locale", { locale: i18n.resolvedLanguage ?? "en" }).catch(() => {});
  }, [i18n.resolvedLanguage]);

  // Check for a signed app update on launch and whenever the window regains focus.
  // Throttled + de-duped inside updater.ts. On a newer version it downloads silently,
  // then prompts the user to restart — it never relaunches without confirmation.
  useEffect(() => {
    autoCheckAndPrompt();
    const onFocus = () => autoCheckAndPrompt();
    const onVisible = () => {
      if (!document.hidden) autoCheckAndPrompt();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Identify the signed-in user to Sentry (UI project). `undefined` = still checking,
  // so only act once we know logged-in vs out.
  useEffect(() => {
    if (session) {
      Sentry.setUser({ email: session.email, username: session.email });
    } else if (session === null) {
      Sentry.setUser(null);
    }
  }, [session]);

  // Past the auth gate when either signed in OR running in personal/local mode.
  const pastAuthGate = session != null || settings?.local_only === true;

  // Re-apply the org capture policy and reload settings. Run on login AND whenever
  // the window regains focus, so admin changes show up next time it's reopened
  // (closing the window doesn't unmount the webview, so a one-time effect wouldn't).
  const refreshFromBackend = useCallback(() => {
    invoke<CaptureManaged>("apply_org_policy")
      .then(setCaptureManaged)
      .catch(() => {})
      .finally(() => {
        invoke<AppSettings>("get_settings").then(setSettings).catch(() => {});
      });
  }, []);

  // Tracking status pill works for both signed-in and personal/local users.
  useEffect(() => {
    if (!pastAuthGate) return;
    invoke<TrackStatus>("tracking_state").then(setStatus).catch(() => {});
    // The tray broadcasts tracking / idle / paused — keep the pill in sync with it.
    const unlisten = listen<TrackStatus>("tracking-state", (e) => setStatus(e.payload));
    return () => {
      unlisten.then((f) => f());
    };
  }, [pastAuthGate]);

  // Org capture policy only applies to real (signed-in) accounts.
  useEffect(() => {
    if (!session) return;
    refreshFromBackend();
  }, [session, refreshFromBackend]);

  // Refresh when the window is reopened/refocused (menu-bar → Open main UI).
  useEffect(() => {
    if (!session) return;
    const onVisible = () => {
      if (!document.hidden) refreshFromBackend();
    };
    window.addEventListener("focus", refreshFromBackend);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", refreshFromBackend);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [session, refreshFromBackend]);

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

  async function signOut() {
    try {
      await invoke("logout");
    } catch {
      /* clear locally regardless */
    }
    setSession(null);
    setSettings(null);
    setScreen("Dashboard");
  }

  // Wait until we know both the session and local settings before routing.
  if (session === undefined || settings === null) {
    return (
      <div className="login">
        <div className="muted">{t("loading")}</div>
      </div>
    );
  }
  // No account and not in personal/local mode → the welcome/persona branch.
  if (!pastAuthGate) {
    return showLogin ? (
      <Login onLoggedIn={setSession} onBack={() => setShowLogin(false)} />
    ) : (
      <Welcome
        onUseLocally={() => updateSettings({ local_only: true })}
        onSignIn={() => setShowLogin(true)}
      />
    );
  }

  // First-run onboarding (3 steps: what's captured → configure → permissions),
  // shown once per install. Step 1 is the "What BiBoTracking captures" disclosure,
  // so finishing/skipping it also records `consented` (gates capture on Windows).
  if (settings && !settings.onboarding_completed) {
    return (
      <Onboarding
        settings={settings}
        captureManaged={captureManaged}
        onChange={updateSettings}
        onFinish={() => updateSettings({ onboarding_completed: true, consented: true })}
      />
    );
  }

  const trackClass =
    status === "paused" ? "is-paused" : status === "idle" ? "is-idle" : "is-tracking";
  const pillTitle =
    status === "paused"
      ? t("statusTooltip.paused")
      : status === "idle"
        ? t("statusTooltip.idle")
        : t("statusTooltip.tracking");

  return (
    <div className="app">
      <div className="app-titlebar" data-tauri-drag-region>
        <span className="app-titlebar-title">BiBoTracking — {t(`nav.${screen}`)}</span>
        <AppTrayMenu status={status} onToggleTracking={toggleTracking} />
      </div>
      <div className="app-body">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M4.5 12 h3.2 l1.8 -4.4 l2.4 8.8 l1.8 -4.4 h4.5" />
            </svg>
          </span>
          <span className="brand-text">
            <span className="brand-name">Bi<span className="brand-accent">Bo</span>Tracking</span>
            {version && <span className="brand-version">v{version}</span>}
          </span>
        </div>
        <nav className="nav">
          {NAV.map((n) => {
            const Ic = NAV_ICON[n];
            return (
              <div
                key={n}
                className={`nav-item ${screen === n ? "active" : ""}`}
                onClick={() => setScreen(n)}
              >
                <span className="nav-ic"><Ic /></span>
                {t(`nav.${n}`)}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <div
            className={`side-status ${status === "paused" ? "paused" : status === "idle" ? "idle" : ""}`}
            title={t(`statusTooltip.${status}`)}
          >
            <span className="dot" /> {t(`status.${status}`)}
          </div>
          {session ? (
            <div className="account-box">
              <div className="account-row">
                <span className="account-ic"><UserIcon /></span>
                <span className="account-text" title={session.email}>{session.email}</span>
              </div>
              <button className="account-link" onClick={signOut}>
                {t("account.signOut")}
              </button>
            </div>
          ) : (
            <div className="account-box">
              <div className="account-row" title={t("account.localTooltip")}>
                <span className="account-ic"><HardDriveIcon /></span>
                <span className="account-text">{t("account.local")}</span>
              </div>
              <button
                className="account-link"
                onClick={() => {
                  setShowLogin(true);
                  updateSettings({ local_only: false });
                }}
                title={t("account.setupAgainTooltip")}
              >
                {t("account.setupAgain")} <span aria-hidden>→</span>
              </button>
            </div>
          )}
        </div>
      </aside>

      <div className="main">
        <header className="header">
          <h1>{t(`nav.${screen}`)}</h1>
          <div className="header-right">
            <LanguageSwitcher compact />
            <Segmented
              options={["Light", "Dark", "System"]}
              value={theme}
              labels={{
                Light: t("theme.light"),
                Dark: t("theme.dark"),
                System: t("theme.system"),
              }}
              onChange={(v) => updateSettings({ theme: v })}
            />
            <span className="bibo-tip">
              <button
                className={`bb-trackpill ${trackClass}`}
                onClick={toggleTracking}
                aria-label={pillTitle}
              >
                {status === "paused" ? <PauseBars /> : <span className="bb-trackpill__dot" />}
                {t(`status.${status}`)}
              </button>
              <span className="bibo-tip__bubble" role="tooltip">{pillTitle}</span>
            </span>
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
              captureManaged={captureManaged}
              onChange={updateSettings}
              onOpenPermissions={() => setScreen("Permissions")}
            />
          )}
        </main>
      </div>
      </div>
    </div>
  );
}

export default App;
