import { Card, StatCard, BarRow, SectionTitle } from "../ui";

// Mock data — replace with queries over activity_sample.
const apps = [
  { name: "VS Code", mins: 182, pct: 100 },
  { name: "Google Chrome", mins: 96, pct: 53 },
  { name: "Slack", mins: 48, pct: 26 },
  { name: "Figma", mins: 31, pct: 17 },
  { name: "Terminal", mins: 22, pct: 12 },
];

// Timeline segments across the working day. opacity differentiates apps (no rainbow).
const timeline = [
  { w: 14, op: 0.9, label: "VS Code" },
  { w: 6, op: 0.5, label: "Chrome" },
  { w: 5, idle: true, label: "Idle" },
  { w: 20, op: 0.9, label: "VS Code" },
  { w: 9, op: 0.5, label: "Chrome" },
  { w: 7, op: 0.3, label: "Slack" },
  { w: 8, idle: true, label: "Idle" },
  { w: 18, op: 0.9, label: "VS Code" },
  { w: 13, op: 0.5, label: "Chrome" },
];

function fmt(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function Dashboard() {
  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <StatCard label="Active time today" value="6h 21m" />
        <StatCard label="Top app" value="VS Code" />
        <StatCard label="Keypresses" value="14,302" />
        <StatCard label="Screenshots" value="38" />
      </div>

      <SectionTitle>Today's timeline</SectionTitle>
      <Card>
        <div className="timeline">
          {timeline.map((s, i) => (
            <div
              key={i}
              className={`timeline-seg ${s.idle ? "timeline-idle" : ""}`}
              title={s.label}
              style={{
                width: `${s.w}%`,
                background: s.idle ? undefined : "var(--accent)",
                opacity: s.idle ? 1 : s.op,
              }}
            />
          ))}
        </div>
        <div className="row spread muted" style={{ fontSize: 12, marginTop: 8 }}>
          <span>9:00</span>
          <span>12:00</span>
          <span>15:00</span>
          <span>18:00</span>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Hatched = idle (not counted). Shade = different app.
        </div>
      </Card>

      <SectionTitle>App breakdown</SectionTitle>
      <Card>
        {apps.map((a) => (
          <BarRow key={a.name} label={a.name} value={fmt(a.mins)} pct={a.pct} />
        ))}
      </Card>
    </>
  );
}
