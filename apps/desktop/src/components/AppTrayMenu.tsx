import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * AppTrayMenu — the top-right tray button in the app's full-width title bar,
 * mirroring the auth-surface TrayMenu look but wired to the real tracking state.
 * It's the in-window stand-in for the native menu-bar item: shows status and lets
 * the user start/stop tracking. Language and theme live in the content header.
 */

type TrackStatus = "tracking" | "idle" | "paused";

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

const STATUS_COLOR: Record<TrackStatus, string> = {
  tracking: "#10b981",
  idle: "#f59e0b",
  paused: "#3b82f6",
};

export function AppTrayMenu({
  status,
  onToggleTracking,
}: {
  status: TrackStatus;
  onToggleTracking: () => void;
}) {
  const { t } = useTranslation();
  const { t: tw } = useTranslation("welcome");
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

  const color = STATUS_COLOR[status];
  const stateLabel = t(`status.${status}`);
  const paused = status === "paused";

  return (
    <div className="tray" ref={ref}>
      <button
        type="button"
        className="tray-trigger"
        style={{ color }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${tw("tray.status")}: ${stateLabel}`}
        onClick={() => setOpen((o) => !o)}
      >
        {paused ? <PauseGlyph /> : <RecordGlyph />}
      </button>

      {open && (
        <div className="tray-menu" role="menu">
          <div className="tray-head">
            <span className="tray-status">
              <span className="tray-dot" style={{ background: color }} />
              {tw("tray.status")} : {stateLabel}
            </span>
          </div>
          <div className="tray-sep" />
          <button
            type="button"
            className="tray-item"
            disabled={!paused}
            onClick={() => {
              if (paused) onToggleTracking();
              setOpen(false);
            }}
          >
            <PlayIcon />
            {tw("tray.start")}
          </button>
          <button
            type="button"
            className="tray-item"
            disabled={paused}
            onClick={() => {
              if (!paused) onToggleTracking();
              setOpen(false);
            }}
          >
            <StopIcon />
            {tw("tray.stop")}
          </button>
        </div>
      )}
    </div>
  );
}
