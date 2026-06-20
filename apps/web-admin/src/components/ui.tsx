import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function Card({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="card" style={style}>
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 600, margin: "24px 0 10px" }}>{children}</div>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="row" style={{ gap: 8 }}>
      <span className="spinner" aria-hidden /> {label && <span className="muted">{label}</span>}
    </span>
  );
}

export function Notice({
  kind,
  children,
}: {
  kind: "danger" | "success" | "info";
  children: ReactNode;
}) {
  return (
    <div className={`notice notice-${kind}`} role={kind === "danger" ? "alert" : undefined}>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Field({
  label,
  children,
  error,
}: {
  label: string;
  children: ReactNode;
  error?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}

/** StepDots — wizard/onboarding progress, e.g. ●──●──○ (current of total). */
export function StepDots({ total, current }: { total: number; current: number }) {
  const { t } = useTranslation("ui");
  return (
    <span className="step-dots" role="img" aria-label={t("stepProgress", { current, total })}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center" }}>
          {i > 0 && <span className="dot-bar" />}
          <span
            className={`dot-step ${i + 1 < current ? "done" : i + 1 === current ? "current" : ""}`}
          />
        </span>
      ))}
    </span>
  );
}

export interface RailStep {
  title: string;
  description: string;
}

/** ProgressRail — vertical step list for the two-column welcome/onboarding layout.
 *  `current` is 1-based; markers derive from it (done ✓ / current ring / upcoming). */
export function ProgressRail({ steps, current }: { steps: RailStep[]; current: number }) {
  return (
    <ol className="progress-rail">
      {steps.map((s, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "current" : "upcoming";
        return (
          <li key={s.title} className={`rail-step ${state}`}>
            <span className="rail-marker" aria-hidden>
              {state === "done" ? "✓" : n}
            </span>
            <span className="rail-text">
              <span className="rail-title">{s.title}</span>
              <span className="rail-desc">{s.description}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** SuccessBurst — light gamified completion: a checklist of done + next items. */
export function SuccessBurst({
  title,
  items,
}: {
  title: string;
  items: { label: string; done: boolean }[];
}) {
  return (
    <div className="success-burst">
      <div className="burst-mark" aria-hidden>
        ✦
      </div>
      <div className="burst-title">{title}</div>
      <ul>
        {items.map((it) => (
          <li key={it.label} className={it.done ? "done" : "todo"}>
            {it.done ? "✓" : "○"} {it.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={wide ? undefined : "modal"} onClick={(e) => e.stopPropagation()}>
        {title && <h2>{title}</h2>}
        {children}
      </div>
    </div>
  );
}
