import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AuthTitleBar } from "../components/AuthTitleBar";
import { AdminLogin, type AdminLoginResult, type AdminUser } from "./admin/AdminLogin";
import { AdminShell } from "./admin/AdminShell";

// The Admin section: a native (app-styled) owner sign-in, then the admin shell
// (icon rail + topbar) with the team dashboard — rendered with the app's own
// colours/structure instead of the embedded web-admin. The owner token lives here
// for the section's lifetime only; it never touches the tracker's session.
//
// Two modes:
//  - sidebar (default): fills the content well alongside the tracker nav.
//  - standalone (`onBack` given): opened straight from the Welcome screen, full
//    window with the draggable title bar; the shell topbar carries the back button.
export function Admin({
  onBack,
  theme,
  onThemeChange,
}: {
  onBack?: () => void;
  theme: string;
  onThemeChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const [session, setSession] = useState<{ token: string; user: AdminUser } | null>(null);

  const onSignedIn = (r: AdminLoginResult) =>
    setSession({ token: r.access_token, user: r.user });

  // ── signed in → the admin shell ──
  if (session) {
    const shell = (
      <AdminShell
        token={session.token}
        user={session.user}
        onSignOut={() => setSession(null)}
        onBack={onBack}
        theme={theme}
        onThemeChange={onThemeChange}
      />
    );
    if (!onBack) return <div className="bb-admin-native">{shell}</div>;
    return (
      <div className="bb-admin-standalone">
        <AuthTitleBar />
        {shell}
      </div>
    );
  }

  // ── signed out → the native sign-in ──
  if (!onBack) return <div className="bb-admin-native"><AdminLogin onSignedIn={onSignedIn} /></div>;
  return (
    <div className="bb-admin-standalone">
      <AuthTitleBar />
      <div className="bb-admin-standalone__bar">
        <button type="button" className="bb-admin-back" onClick={onBack}>
          <span aria-hidden>←</span> {t("screens:admin.back")}
        </button>
      </div>
      <div className="bb-admin-standalone__body">
        <AdminLogin onSignedIn={onSignedIn} />
      </div>
    </div>
  );
}
