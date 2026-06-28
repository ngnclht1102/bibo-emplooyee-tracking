import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { call as invoke } from "../api";
import { LOCALES } from "../i18n";

/**
 * LanguageSwitcher — a flag dropdown for the active locale (matches the marketing
 * site and web admin). The trigger shows the current flag + native name; the menu
 * lists every locale with its flag. Persisted to the webview's localStorage by
 * i18next's detector (key: "locale"), and mirrored to the Rust side
 * (settings.locale) so the native tray follows the same language.
 *
 * `align`/`drop` control where the menu opens so it never clips its container.
 */
export function LanguageSwitcher({
  className,
  align = "right",
  drop = "down",
  compact = false,
}: {
  className?: string;
  align?: "left" | "right";
  drop?: "up" | "down";
  /** Compact trigger: a globe + the locale code (EN) instead of flag + native name. */
  compact?: boolean;
}) {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const code = LOCALES.find((l) => l.code === i18n.resolvedLanguage)?.code ?? "en";
  const current = LOCALES.find((l) => l.code === code) ?? LOCALES[0];

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

  function pick(c: string) {
    i18n.changeLanguage(c);
    // Mirror to native settings so the tray menu/tooltip localize too (best-effort).
    invoke("set_locale", { locale: c }).catch(() => {});
    setOpen(false);
  }

  return (
    <div className={`lang-switcher ${className ?? ""}`} ref={ref}>
      <button
        type="button"
        className="lang-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("language")}
        title={t("language")}
        onClick={() => setOpen((o) => !o)}
      >
        {compact ? (
          <>
            <svg
              className="lang-globe"
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" />
            </svg>
            <span className="lang-label">{current.code.toUpperCase()}</span>
          </>
        ) : (
          <>
            <span className="lang-flag" aria-hidden>
              {current.flag}
            </span>
            <span className="lang-label">{current.label}</span>
          </>
        )}
        <svg
          className="lang-caret"
          viewBox="0 0 24 24"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className={`lang-menu ${drop} ${align}`} role="listbox">
          {LOCALES.map((l) => (
            <button
              type="button"
              key={l.code}
              role="option"
              aria-selected={l.code === code}
              className={`lang-opt${l.code === code ? " active" : ""}`}
              onClick={() => pick(l.code)}
            >
              <span className="lang-flag" aria-hidden>
                {l.flag}
              </span>
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
