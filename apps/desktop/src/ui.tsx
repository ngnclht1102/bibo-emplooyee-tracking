import type { ReactNode } from "react";

export function Card({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="card" style={style}>
      {children}
    </div>
  );
}

export function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <div className="stat-label">{label}</div>
      <div className="stat-value num">{value}</div>
    </Card>
  );
}

export function BarRow({ label, value, pct }: { label: string; value: string; pct: number }) {
  return (
    <div className="row" style={{ marginBottom: 10 }}>
      <div style={{ width: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="num muted" style={{ width: 64, textAlign: "right" }}>
        {value}
      </div>
    </div>
  );
}

export function Pill({ kind, children }: { kind: "success" | "danger"; children: ReactNode }) {
  return <span className={`pill pill-${kind}`}>{children}</span>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 600, margin: "24px 0 10px" }}>{children}</div>
  );
}

export function Segmented({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o} className={o === value ? "active" : ""} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}
