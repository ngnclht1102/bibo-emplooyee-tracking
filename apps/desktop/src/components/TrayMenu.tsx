import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./LanguageSwitcher";

/**
 * TrayMenu — a top-right popover on the welcome surface that mirrors the desktop
 * app's system-tray menu (status · language · Open / Start / Stop / Quit). Purely
 * visual on this screen: there's no tracking session before setup, so it toggles
 * only the on-screen status (matching the offline-app mockup and the web-admin
 * auth demo). The real controls live in the native tray once the app is set up.
 */

type TrackState = "tracking" | "paused";

const PauseGlyph = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="14" y="3" width="5" height="18" rx="1" />
    <rect x="5" y="3" width="5" height="18" rx="1" />
  </svg>
);
const RecordGlyph = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="3.5" fill="currentColor" />
  </svg>
);
const OpenIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18" />
  </svg>
);
const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polygon points="6 4 20 12 6 20 6 4" />
  </svg>
);
const StopIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="5" y="5" width="14" height="14" rx="2" />
  </svg>
);
const PowerIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
    <line x1="12" y1="2" x2="12" y2="12" />
  </svg>
);

export function TrayMenu() {
  const { t } = useTranslation("welcome");
  const [state, setState] = useState<TrackState>("paused");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const stateLabel = state === "tracking" ? t("tray.tracking") : t("tray.paused");
  const stateColor = state === "tracking" ? "#10b981" : "#3b82f6";

  return (
    <div className="tray" ref={ref}>
      <button
        type="button"
        className="tray-trigger"
        style={{ color: stateColor }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t("tray.status")}: ${stateLabel}`}
        onClick={() => setOpen((o) => !o)}
      >
        {state === "tracking" ? <RecordGlyph /> : <PauseGlyph />}
      </button>

      {open && (
        <div className="tray-menu" role="menu">
          <div className="tray-head">
            <span className="tray-status">
              <span className="tray-dot" style={{ background: stateColor }} />
              {t("tray.status")} : {stateLabel}
            </span>
            <LanguageSwitcher compact align="right" />
          </div>
          <div className="tray-sep" />
          <button type="button" className="tray-item" onClick={() => setOpen(false)}>
            <OpenIcon />
            {t("tray.open")}
          </button>
          <button
            type="button"
            className="tray-item"
            disabled={state === "tracking"}
            onClick={() => {
              setState("tracking");
              setOpen(false);
            }}
          >
            <PlayIcon />
            {t("tray.start")}
          </button>
          <button
            type="button"
            className="tray-item"
            disabled={state === "paused"}
            onClick={() => {
              setState("paused");
              setOpen(false);
            }}
          >
            <StopIcon />
            {t("tray.stop")}
          </button>
          <div className="tray-sep" />
          <button type="button" className="tray-item danger" onClick={() => setOpen(false)}>
            <PowerIcon />
            {t("tray.quit")}
          </button>
        </div>
      )}
    </div>
  );
}
