// Shared bits for the billing pages (ticket 152). Everything is composed from the
// design-system classes (bibo-dlg, bibo-field, bibo-input, pill, bibo-avatar).
import type { FormEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { activeLocale } from "../../i18n";
import { Modal, Notice } from "../../components/ui";
import type { InvoiceStatus } from "../../api/billing";

const svg = (children: ReactNode, size = 24) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);
export const IconPlus = svg(<><path d="M5 12h14" /><path d="M12 5v14" /></>);
export const IconClose = svg(<path d="M18 6 6 18M6 6l12 12" />);
export const IconClock = svg(<><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>);
export const IconCheckList = svg(<><path d="m3 17 2 2 4-4" /><path d="m3 7 2 2 4-4" /><path d="M13 6h8" /><path d="M13 12h8" /><path d="M13 18h8" /></>);
export const IconFolder = svg(<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />);
export const IconReceipt = svg(<><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" /><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" /><path d="M12 17.5v-11" /></>);
export const IconCoins = svg(<><circle cx="8" cy="8" r="6" /><path d="M18.09 10.37A6 6 0 1 1 10.34 18" /><path d="M7 6h1v4" /><path d="m16.71 13.88.7.71-2.82 2.82" /></>);
export const IconBriefcase = svg(<><path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /><rect width="20" height="14" x="2" y="6" rx="2" /></>);
export const IconAlert = svg(<><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></>);
export const IconPrinter = svg(<><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6" /><rect x="6" y="14" width="12" height="8" rx="1" /></>);
export const IconArrowRight = svg(<><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>);
export const IconChevron = svg(<path d="m9 18 6-6-6-6" />);

export const ic = (node: ReactNode) => <span style={{ display: "inline-flex", lineHeight: 0 }}>{node}</span>;

// ── money + time ────────────────────────────────────────────
export function fmtMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(activeLocale(), { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}
/** "12.5" / "12,50" → 1250 cents; null when not a non-negative number. */
export function parseMoney(s: string): number | null {
  const v = Number(s.trim().replace(/\s/g, "").replace(",", "."));
  return s.trim() !== "" && Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : null;
}
export const centsToInput = (c: number | null | undefined) => (c == null ? "" : String(c / 100));

/** Hours with two decimals, e.g. 5400 → "1.50". */
export function fmtHours(seconds: number): string {
  return new Intl.NumberFormat(activeLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(seconds / 3600);
}
/** "1:30", "1h 30m", "90m", "1.5" → seconds; null when unreadable or not in (0, 24h]. */
export function parseDuration(s: string): number | null {
  const v = s.trim().toLowerCase().replace(",", ".");
  let secs: number | null = null;
  let m: RegExpMatchArray | null;
  if ((m = v.match(/^(\d+):([0-5]?\d)$/))) secs = +m[1] * 3600 + +m[2] * 60;
  else if ((m = v.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m)?$/)) && (m[1] || m[2])) secs = Math.round((+(m[1] ?? 0)) * 3600) + +(m[2] ?? 0) * 60;
  else if (/^\d+(\.\d+)?$/.test(v)) secs = Math.round(+v * 3600);
  return secs != null && secs > 0 && secs <= 86400 ? secs : null;
}
/** Seconds → "h:mm" for editing. */
export function toHm(seconds: number): string {
  return `${Math.floor(seconds / 3600)}:${String(Math.round((seconds % 3600) / 60)).padStart(2, "0")}`;
}
export function fmtDay(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString(activeLocale(), { month: "short", day: "numeric", year: "numeric" });
}

// ── avatars (same palette as Dashboard / Employees) ─────────
const AVATAR_PALETTE = [
  { bg: "var(--info-soft)", fg: "var(--info)" },
  { bg: "var(--positive-soft)", fg: "var(--positive)" },
  { bg: "color-mix(in srgb, var(--data-rose) 18%, transparent)", fg: "var(--data-rose)" },
  { bg: "color-mix(in srgb, var(--data-amber) 22%, transparent)", fg: "var(--data-amber)" },
];
const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
function paletteFor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}
export function NameCell({ id, name, sub, size = 30 }: { id: string; name: string; sub?: ReactNode; size?: number }) {
  const pal = paletteFor(id);
  return (
    <div className="admin-name">
      <span className="bibo-avatar" style={{ ["--_s" as string]: `${size}px` }}>
        <span className="bibo-avatar__img" aria-label={name} style={{ background: pal.bg, color: pal.fg }}>
          {initials(name)}
        </span>
      </span>
      <span className="admin-name__txt">
        {name}
        {sub && <span className="bill-sub">{sub}</span>}
      </span>
    </div>
  );
}

// ── status pills (icon/label + text, never hue alone) ───────
export function InvoicePill({ status, overdue }: { status: InvoiceStatus; overdue?: boolean }) {
  const { t } = useTranslation("billing");
  if (overdue) return <span className="pill pill-danger">{t("invoices.status.overdue")}</span>;
  const cls = status === "paid" ? "pill pill-success" : status === "sent" ? "pill pill-warn" : "pill";
  return <span className={cls}>{t(`invoices.status.${status}`)}</span>;
}

// ── dialog frame (bibo-dlg, as in Employees.tsx) ────────────
export function Dialog({
  icon, title, width = 480, onClose, onSubmit, error, children, foot,
}: {
  icon: ReactNode;
  title: string;
  width?: number;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
  error?: string | null;
  children: ReactNode;
  foot: ReactNode;
}) {
  const { t } = useTranslation("billing");
  return (
    <Modal wide onClose={onClose}>
      <div className="bibo-dlg" role="dialog" aria-modal="true" style={{ ["--_w" as string]: `${width}px` }}>
        <div className="bibo-dlg__head">
          <div className="bibo-dlg__icon">{ic(icon)}</div>
          <div className="bibo-dlg__title">{title}</div>
          <button type="button" className="bibo-dlg__close" aria-label={t("common.cancel")} onClick={onClose}>
            {IconClose}
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(e);
          }}
        >
          <div className="bibo-dlg__body">
            {error && (
              <div style={{ marginBottom: 12 }}>
                <Notice kind="danger">{error}</Notice>
              </div>
            )}
            <div className="bill-form">{children}</div>
          </div>
          <div className="bibo-dlg__foot">{foot}</div>
        </form>
      </div>
    </Modal>
  );
}

export function TextField({
  label, value, onChange, type = "text", placeholder, required, autoFocus, hint, min, max,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
  hint?: string;
  min?: string;
  max?: string;
}) {
  return (
    <label className="bibo-field">
      <span className="bibo-field__lbl">{label}</span>
      <span className="bibo-input">
        <input type={type} value={value} placeholder={placeholder} required={required} autoFocus={autoFocus}
          min={min} max={max} onChange={(e) => onChange(e.target.value)} />
      </span>
      {hint && <span className="bill-hint">{hint}</span>}
    </label>
  );
}

export function TextArea({ label, value, onChange, rows = 3, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string;
}) {
  return (
    <label className="bibo-field">
      <span className="bibo-field__lbl">{label}</span>
      <span className="bibo-input bill-textarea">
        <textarea rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      </span>
    </label>
  );
}

export function SelectField({
  label, value, onChange, children, required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="bibo-field">
      <span className="bibo-field__lbl">{label}</span>
      <span className="bibo-input">
        <select value={value} required={required} onChange={(e) => onChange(e.target.value)}>
          {children}
        </select>
      </span>
    </label>
  );
}

export const Row2 = ({ children }: { children: ReactNode }) => <div className="bill-row2">{children}</div>;

/** Dialog footer: ghost cancel + one primary. */
export function DialogFoot({ onClose, busy, label, disabled, extra }: {
  onClose: () => void; busy: boolean; label: string; disabled?: boolean; extra?: ReactNode;
}) {
  const { t } = useTranslation("billing");
  return (
    <>
      {extra}
      <button type="button" className="bibo-btn bibo-btn--ghost" onClick={onClose}>
        {t("common.cancel")}
      </button>
      <button className="bibo-btn bibo-btn--primary" disabled={busy || disabled}>
        {busy ? t("common.saving") : label}
      </button>
    </>
  );
}

export function errText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

/** Local YYYY-MM-DD for today ± days. */
export function localDay(offsetDays = 0, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function startOfWeek(): string {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  return localDay(-dow, d);
}
export function startOfMonth(): string {
  const d = new Date();
  return localDay(0, new Date(d.getFullYear(), d.getMonth(), 1));
}
