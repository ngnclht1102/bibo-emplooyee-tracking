import { Card, SectionTitle } from "../ui";

// Mock keypress counts per 30-min bucket across the day.
const buckets = [
  20, 60, 140, 210, 180, 90, 240, 300, 260, 120, 30, 0, 80, 200, 280, 240, 190, 160,
  220, 140, 60, 20,
];
const max = Math.max(...buckets);

export function Activity() {
  return (
    <>
      <SectionTitle>Keyboard activity</SectionTitle>
      <Card>
        <div className="chart">
          {buckets.map((b, i) => (
            <div
              className="chart-bar"
              key={i}
              style={{ height: `${(b / max) * 100}%` }}
              title={`${b} keys`}
            />
          ))}
        </div>
        <div className="row spread muted" style={{ fontSize: 12, marginTop: 8 }}>
          <span>9:00</span>
          <span>12:00</span>
          <span>15:00</span>
          <span>18:00</span>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          🔒 Counts only — actual keys are never recorded.
        </div>
      </Card>
    </>
  );
}
