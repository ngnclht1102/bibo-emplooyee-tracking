import { type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

// Shared bits for the task/billing screens (member Tasks + the owner's native
// Projects / Tasks admin screens): the modal shell and the icons they all use.
// Everything is composed from the existing design-system classes.

const svgp = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
export const IconPlus = () => (<svg {...svgp} width="16" height="16" aria-hidden><path d="M5 12h14" /><path d="M12 5v14" /></svg>);
export const IconPlay = () => (<svg {...svgp} width="16" height="16" aria-hidden><path d="M6 3l14 9-14 9V3z" /></svg>);
export const IconStop = () => (<svg {...svgp} width="16" height="16" aria-hidden><rect x="5" y="5" width="14" height="14" rx="2" /></svg>);
export const IconX = () => (<svg {...svgp} width="18" height="18" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>);
export const IconClock = () => (<svg {...svgp} width="20" height="20" aria-hidden><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>);
export const IconList = () => (<svg {...svgp} width="20" height="20" aria-hidden><path d="m3 17 2 2 4-4" /><path d="m3 7 2 2 4-4" /><path d="M13 6h8" /><path d="M13 12h8" /><path d="M13 18h8" /></svg>);
export const IconFolder = () => (<svg {...svgp} width="20" height="20" aria-hidden><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></svg>);
export const IconUser = () => (<svg {...svgp} width="20" height="20" aria-hidden><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>);
export const IconBack = () => (<svg {...svgp} width="16" height="16" aria-hidden><path d="m15 18-6-6 6-6" /></svg>);

/** Modal shell: head with icon + close, body, footer with cancel/submit. */
export function Dlg({ icon, title, onClose, onSubmit, error, busy, submitLabel, extra, children }: {
  icon: ReactNode; title: string; onClose: () => void; onSubmit: () => void; error: string | null;
  busy: boolean; submitLabel: string; extra?: ReactNode; children: ReactNode;
}) {
  const { t } = useTranslation("tasks");
  return (
    <div className="bb-modal-overlay" onClick={() => !busy && onClose()}>
      <div className="bibo-dlg" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); onSubmit(); }}>
          <div className="bibo-dlg__head">
            <div className="bibo-dlg__icon">{icon}</div>
            <div className="bibo-dlg__title">{title}</div>
            <button type="button" className="bibo-dlg__close" aria-label={t("cancel")} onClick={onClose}><IconX /></button>
          </div>
          <div className="bibo-dlg__body">
            {error && <div className="auth-err" role="alert">{error}</div>}
            {children}
          </div>
          <div className="bibo-dlg__foot">
            {extra}
            <button type="button" className="bibo-btn bibo-btn--ghost" onClick={onClose} disabled={busy}>{t("cancel")}</button>
            <button type="submit" className="bibo-btn bibo-btn--primary" disabled={busy}>{busy ? t("saving") : submitLabel}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="bibo-field">
      <span className="bibo-field__lbl">{label}</span>
      <span className="bibo-input">{children}</span>
    </label>
  );
}
