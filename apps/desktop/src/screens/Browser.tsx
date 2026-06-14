import { Card, BarRow, SectionTitle } from "../ui";

const topSites = [
  { name: "github.com", mins: 73, pct: 100 },
  { name: "mail.google.com", mins: 41, pct: 56 },
  { name: "figma.com", mins: 28, pct: 38 },
  { name: "stackoverflow.com", mins: 19, pct: 26 },
];

const visits = [
  { title: "ctracking · Pull requests", url: "github.com/you/ctracking/pulls", time: "22m", at: "14:32" },
  { title: "Inbox (3) — Gmail", url: "mail.google.com/mail/u/0", time: "18m", at: "14:05" },
  { title: "ctracking — Figma", url: "figma.com/file/abc/ctracking", time: "15m", at: "13:40" },
  { title: "rust - tokio mutex - Stack Overflow", url: "stackoverflow.com/q/123", time: "9m", at: "13:18" },
  { title: "Tauri v2 | Docs", url: "tauri.app/start", time: "12m", at: "12:55" },
];

export function Browser() {
  return (
    <>
      <SectionTitle>Top sites by time</SectionTitle>
      <Card>
        {topSites.map((s) => (
          <BarRow key={s.name} label={s.name} value={`${s.mins}m`} pct={s.pct} />
        ))}
      </Card>

      <SectionTitle>Page visits</SectionTitle>
      <Card style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Page</th>
              <th>Site</th>
              <th style={{ textAlign: "right" }}>Time</th>
              <th style={{ textAlign: "right" }}>When</th>
            </tr>
          </thead>
          <tbody>
            {visits.map((v, i) => (
              <tr key={i}>
                <td>{v.title}</td>
                <td className="muted">{v.url}</td>
                <td className="num" style={{ textAlign: "right" }}>
                  {v.time}
                </td>
                <td className="num muted" style={{ textAlign: "right" }}>
                  {v.at}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
