import { useTranslation } from "react-i18next";
import type { BrowserVisit } from "../../api/types";
import { fmtDuration, fmtTime } from "../../format";
import { Empty } from "../ui";

export function BrowserPanel({ visits }: { visits: BrowserVisit[] }) {
  const { t } = useTranslation("reports");
  if (visits.length === 0) return <Empty>{t("browser.empty")}</Empty>;

  return (
    <table>
      <thead>
        <tr>
          <th>{t("browser.table.time")}</th>
          <th>{t("browser.table.page")}</th>
          <th>{t("browser.table.browser")}</th>
          <th style={{ textAlign: "right" }}>{t("browser.table.duration")}</th>
        </tr>
      </thead>
      <tbody>
        {visits.map((v, i) => (
          <tr key={`${v.ts}-${i}`}>
            <td className="num muted" style={{ whiteSpace: "nowrap" }}>
              {fmtTime(v.ts)}
            </td>
            <td>
              <div style={{ fontWeight: 500 }}>{v.page_title || t("browser.untitled")}</div>
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
