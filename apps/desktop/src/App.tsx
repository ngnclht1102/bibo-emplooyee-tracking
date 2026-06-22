import { useCallback, useEffect, useRef, useState } from "react";
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
import { Consent } from "./screens/Consent";
import { LanguageSwitcher } from "./components/LanguageSwitcher";

// Windows has no per-feature OS permission prompts, so we gate first-run capture on
// an in-app consent screen. macOS relies on TCC and skips it.
const IS_WINDOWS = navigator.userAgent.includes("Windows");

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

  // Product analytics (ticket 133): app activation + UI clicks → Aptabase.
  useEffect(() => {
    // "app_active": the window came to the foreground (user switched back to us).
    // Throttled so rapid alt-tabbing doesn't spam one event per focus.
    let lastActive = 0;
    const onActive = () => {
      const now = Date.now();
      if (now - lastActive < 30_000) return;
      lastActive = now;
      track("app_active");
    };
    const onVisible = () => {
      if (!document.hidden) onActive();
    };
    // "ui_click": delegated — any button or sidebar nav item, labelled by its text.
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.("button, .nav-item");
      if (!el) return;
      const label = (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40);
      track("ui_click", { label, screen: screenRef.current });
    };
    window.addEventListener("focus", onActive);
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("focus", onActive);
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("click", onClick, true);
    };
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

  // Windows: require first-run consent before showing the app (capture stays off in
  // the backend until `consented` is persisted).
  if (IS_WINDOWS && settings && !settings.consented) {
    return <Consent onConsent={() => updateSettings({ consented: true })} />;
  }

  // First-run onboarding (welcome → toggles → permissions), shown once per install.
  if (settings && !settings.onboarding_completed) {
    return (
      <Onboarding
        settings={settings}
        captureManaged={captureManaged}
        onChange={updateSettings}
        onFinish={() => updateSettings({ onboarding_completed: true })}
      />
    );
  }

  const pillClass =
    status === "paused" ? "pill-danger" : status === "idle" ? "pill-warn" : "pill-success";
  const pillContent =
    status === "paused" ? (
      `❚❚ ${t("status.paused")}`
    ) : status === "idle" ? (
      <>🟡 {t("status.idle")}</>
    ) : (
      <>
        <span className="dot" /> {t("status.tracking")}
      </>
    );
  const pillTitle =
    status === "paused"
      ? t("statusTooltip.paused")
      : status === "idle"
        ? t("statusTooltip.idle")
        : t("statusTooltip.tracking");

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          BiBoTracking
          {version && <span className="brand-version">v{version}</span>}
        </div>
        {NAV.map((n) => (
          <div
            key={n}
            className={`nav-item ${screen === n ? "active" : ""}`}
            onClick={() => setScreen(n)}
          >
            {t(`nav.${n}`)}
          </div>
        ))}
        <div className="sidebar-foot">
          {session ? (
            <>
              <div title={session.email}>{session.email}</div>
              <button className="signout" onClick={signOut}>
                {t("account.signOut")}
              </button>
            </>
          ) : (
            <>
              <div className="muted" title={t("account.localTooltip")}>
                {t("account.local")}
              </div>
              <button
                className="signout"
                onClick={() => {
                  setShowLogin(true);
                  updateSettings({ local_only: false });
                }}
                title={t("account.setupAgainTooltip")}
              >
                {t("account.setupAgain")}
              </button>
            </>
          )}
        </div>
      </aside>

      <div className="main">
        <header className="header">
          <h1>{t(`nav.${screen}`)}</h1>
          <div className="row">
            <LanguageSwitcher />
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
              captureManaged={captureManaged}
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
