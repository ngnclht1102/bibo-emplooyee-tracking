import type { KeystrokeBucket } from "../../api/types";
import { fmtTime } from "../../format";
import { Empty } from "../ui";

// Counts only — never the keys themselves (privacy). The caption makes that
// explicit in the UI.
export function KeystrokePanel({ buckets }: { buckets: KeystrokeBucket[] }) {
  if (buckets.length === 0) return <Empty>No keystroke activity for this range.</Empty>;

  const max = Math.max(...buckets.map((b) => b.count), 1);
  const total = buckets.reduce((s, b) => s + b.count, 0);

  return (
    <div>
      <div className="row spread" style={{ marginBottom: 8 }}>
        <span className="caption">
          {total.toLocaleString()} keystrokes across {buckets.length} buckets
        </span>
      </div>
      <div className="chart">
        {buckets.map((b) => (
          <div
            key={b.ts_bucket}
            className="chart-bar"
            title={`${fmtTime(b.ts_bucket)} — ${b.count.toLocaleString()} keystrokes`}
            style={{ height: `${(b.count / max) * 100}%` }}
          />
        ))}
      </div>
      <div className="caption" style={{ marginTop: 8 }}>
        Counts only. Individual keys are never captured or stored — this chart shows typing volume,
        not content.
      </div>
    </div>
  );
}
