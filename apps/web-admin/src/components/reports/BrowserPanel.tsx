import type { BrowserVisit } from "../../api/types";
import { fmtDuration, fmtTime } from "../../format";
import { Empty } from "../ui";

export function BrowserPanel({ visits }: { visits: BrowserVisit[] }) {
  if (visits.length === 0) return <Empty>No browser visits for this range.</Empty>;

  return (
    <table>
      <thead>
        <tr>
          <th>Time</th>
          <th>Page</th>
          <th>Browser</th>
          <th style={{ textAlign: "right" }}>Duration</th>
        </tr>
      </thead>
      <tbody>
        {visits.map((v, i) => (
          <tr key={`${v.ts}-${i}`}>
            <td className="num muted" style={{ whiteSpace: "nowrap" }}>
              {fmtTime(v.ts)}
            </td>
            <td>
              <div style={{ fontWeight: 500 }}>{v.page_title || "(untitled)"}</div>
              <div
                className="caption"
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 420,
                }}
                title={v.url}
              >
                {v.url}
              </div>
            </td>
            <td className="muted">{v.browser}</td>
            <td className="num" style={{ textAlign: "right" }}>
              {fmtDuration(v.duration_s)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
