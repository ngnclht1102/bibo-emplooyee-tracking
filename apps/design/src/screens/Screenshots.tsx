import { Card, Segmented } from "../ui";
import { useState } from "react";

// Mock — replace with screenshot rows grouped by time.
const groups = [
  { time: "09:00 – 12:00", shots: ["09:05", "09:15", "09:25", "09:35"] },
  { time: "12:00 – 15:00", shots: ["12:10", "12:20", "12:30", "12:40", "12:50"] },
  { time: "15:00 – 18:00", shots: ["15:05", "15:15", "15:25"] },
];

export function Screenshots() {
  const [range, setRange] = useState("Today");
  return (
    <>
      <div className="row spread" style={{ marginBottom: 16 }}>
        <span className="muted">Periodic captures, every 10 min</span>
        <Segmented options={["Today", "7 days", "30 days"]} value={range} onChange={setRange} />
      </div>

      {groups.map((g) => (
        <div key={g.time} style={{ marginBottom: 24 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
            {g.time}
          </div>
          <div className="gallery">
            {g.shots.map((t) => (
              <div className="shot" key={t} title={`Captured ${t}`}>
                <div className="thumb">screen · {t}</div>
                <div className="cap num">{t}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
