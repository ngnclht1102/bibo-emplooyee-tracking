import { TrayMenu } from "./TrayMenu";

/**
 * AuthTitleBar — the custom (Overlay) window title bar for the auth / onboarding
 * surfaces: a draggable strip with the app name centered and the tray menu pinned
 * to the right. The native macOS traffic lights overlay the left. "BiBoTracking"
 * is the brand and stays verbatim in every locale.
 */
export function AuthTitleBar() {
  return (
    <div className="welcome-titlebar" data-tauri-drag-region>
      <span className="welcome-titlebar-title">BiBoTracking</span>
      <TrayMenu />
    </div>
  );
}
