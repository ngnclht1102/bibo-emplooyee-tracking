import type { ActivityResponse } from "../../api/types";
import { fmtDuration } from "../../format";
import { Empty } from "../ui";

// App breakdown uses a SINGLE hue: each app gets a different opacity of the
// accent color (densest = most-used), never a rainbow — per docs/07.
function accentTone(rank: number, total: number): string {
  // 1.0 down to ~0.25 across the list.
  const min = 0.25;
  const t = total <= 1 ? 1 : 1 - (rank / (total - 1)) * (1 - min);
  return `color-mix(in srgb, var(--accent) ${Math.round(t * 100)}%, transparent)`;
}

export function ActivityPanel({ data }: { data: ActivityResponse }) {
  const breakdown = [...data.breakdown].sort((a, b) => b.duration_s - a.duration_s);
  const total = breakdown.reduce((s, b) => s + b.duration_s, 0);

  if (breakdown.length === 0) return <Empty>No activity recorded for this range.</Empty>;

  return (
    <div>
      {/* Proportional timeline: one bar, app segments by tone/opacity. */}
      <div className="timeline" style={{ marginBottom: 16 }}>
        {breakdown.map((b, i) => {
          const pct = total > 0 ? (b.duration_s / total) * 100 : 0;
          return (
            <div
              key={b.app_name}
              className="timeline-seg"
              title={`${b.app_name} — ${fmtDuration(b.duration_s)}`}
              style={{ width: `${pct}%`, background: accentTone(i, breakdown.length) }}
            />
          );
        })}
      </div>

      {/* Breakdown bars (same single-hue tone scheme). */}
      <div>
        {breakdown.map((b, i) => {
          const pct = total > 0 ? (b.duration_s / total) * 100 : 0;
          return (
            <div className="row" key={b.app_name} style={{ marginBottom: 10 }}>
              <div
                style={{
                  width: 160,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {b.app_name}
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ width: `${pct}%`, background: accentTone(i, breakdown.length), opacity: 1 }}
                />
              </div>
              <div className="num muted" style={{ width: 70, textAlign: "right" }}>
                {fmtDuration(b.duration_s)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
