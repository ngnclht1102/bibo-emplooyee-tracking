import type { ReactNode } from "react";
import lockupLight from "../assets/lockup-light.png";
import lockupDark from "../assets/lockup-dark.png";
import { LanguageSwitcher } from "../components/LanguageSwitcher";

/**
 * AuthLayout — the shared "welcome surface": centered card on a soft accent
 * gradient with the brand lockup above it. The one place gradients are allowed
 * (see docs/07-ui-design.md); dashboards stay flat. The correct lockup for the
 * active theme is chosen in CSS via the [data-theme] attribute on <html>.
 */
export function AuthLayout({
  children,
  wide,
  bare,
  footer,
}: {
  children: ReactNode;
  wide?: boolean;
  /** Skip the centered card wrapper — used by the two-column rail layout. */
  bare?: boolean;
  footer?: ReactNode;
}) {
  return (
    <div className="auth-wrap welcome">
      <div className="auth-lang">
        <LanguageSwitcher />
      </div>
      <img className="auth-logo logo-light" src={lockupLight} alt="BiBoTracking" />
      <img className="auth-logo logo-dark" src={lockupDark} alt="BiBoTracking" />
      {bare ? children : <div className={wide ? "auth-card wide" : "auth-card"}>{children}</div>}
      {footer && <div className="auth-foot">{footer}</div>}
    </div>
  );
}
