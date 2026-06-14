import { Pill } from "../ui";

type Status = "granted" | "denied" | "needs_restart";

const perms: { name: string; purpose: string; status: Status }[] = [
  {
    name: "Accessibility",
    purpose: "Window titles & keyboard activity",
    status: "granted",
  },
  {
    name: "Input Monitoring",
    purpose: "Counting keypresses — counts only, never the keys",
    status: "denied",
  },
  {
    name: "Screen Recording",
    purpose: "Periodic screenshots",
    status: "needs_restart",
  },
];

function Action({ status }: { status: Status }) {
  if (status === "granted") return <Pill kind="success">● Granted</Pill>;
  if (status === "needs_restart")
    return <button className="btn">Quit & Reopen</button>;
  return <button className="btn btn-primary">Open Settings →</button>;
}

function Indicator({ status }: { status: Status }) {
  if (status === "granted") return <span style={{ color: "var(--success)" }}>●</span>;
  return <span style={{ color: "var(--danger)" }}>▲</span>;
}

export function Permissions() {
  const granted = perms.filter((p) => p.status === "granted").length;
  return (
    <div style={{ maxWidth: 640 }}>
      <p className="muted" style={{ marginTop: 0 }}>
        ctracking needs these macOS permissions to work. Status updates automatically.
      </p>

      <div className="set-group">
        {perms.map((p) => (
          <div className="set-row" key={p.name}>
            <div className="row" style={{ gap: 12 }}>
              <Indicator status={p.status} />
              <div>
                <div className="set-title">{p.name}</div>
                <div className="set-desc">{p.purpose}</div>
              </div>
            </div>
            <Action status={p.status} />
          </div>
        ))}
      </div>

      <div className="row spread" style={{ marginTop: 16 }}>
        <span className="muted" style={{ fontSize: 12 }}>
          {granted} of {perms.length} granted · Re-checks automatically
        </span>
        <button className="btn btn-ghost">Re-check</button>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        ⓘ Some permissions require quitting & reopening the app to take effect.
      </div>
    </div>
  );
}
