import { useTranslation } from "react-i18next";
import { fmtHM, hhmm, type BrowserVisitRow } from "../reportTypes";

// Stable colour per domain (hashed) — display only.
const DOMAIN_COLORS = [
  "var(--data-rose)", "var(--data-amber)", "var(--data-teal)",
  "var(--data-mint)", "var(--data-sky)", "var(--data-lavender)",
];
function colorForDomain(d: string): string {
  let h = 0;
  for (let i = 0; i < d.length; i++) h = (h * 31 + d.charCodeAt(i)) >>> 0;
  return DOMAIN_COLORS[h % DOMAIN_COLORS.length];
}
function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Per-visit rows sorted by time spent. Reuses the desktop `bb-tbl` table classes.
export function BrowserPanel({ visits }: { visits: BrowserVisitRow[] }) {
  const { t } = useTranslation();
  if (visits.length === 0)
    return <div className="muted bb-adminboard__msg">{t("screens:detail.browser.empty")}</div>;

  const rows = [...visits].sort((a, b) => b.duration_s - a.duration_s);

  return (
    <div className="card bb-empbrowser">
      <div className="bb-empact__title">{t("screens:detail.browser.title")}</div>
      <table className="bb-tbl">
        <thead>
          <tr>
            <th>{t("screens:detail.browser.domain")}</th>
            <th>{t("screens:detail.browser.time")}</th>
            <th className="r">{t("screens:detail.browser.duration")}</th>
            <th>{t("screens:detail.browser.browserCol")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v, i) => {
            const domain = domainOf(v.url);
            return (
              <tr key={`${v.ts}-${i}`}>
                <td>
                  <div className="bb-tbl__domain">
                    <span className="bb-tbl__fav" style={{ backgroundColor: colorForDomain(domain) }}>
                      {domain.charAt(0).toUpperCase()}
                    </span>
                    <span title={v.page_title || v.url}>{domain}</span>
                  </div>
                </td>
                <td className="bb-tbl__time">{hhmm(v.ts)}</td>
                <td className="r bb-tbl__dur">{fmtHM(v.duration_s)}</td>
                <td>
                  <span className="bb-muted" style={{ fontWeight: 600 }}>{v.browser || "—"}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
