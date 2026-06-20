import { useTranslation } from "react-i18next";
import type { KeystrokeBucket } from "../../api/types";
import { fmtTime } from "../../format";
import { Empty } from "../ui";

// Counts only — never the keys themselves (privacy). The caption makes that
// explicit in the UI.
export function KeystrokePanel({ buckets }: { buckets: KeystrokeBucket[] }) {
  const { t } = useTranslation("reports");
  if (buckets.length === 0) return <Empty>{t("keystrokes.empty")}</Empty>;

  const max = Math.max(...buckets.map((b) => b.count), 1);
  const total = buckets.reduce((s, b) => s + b.count, 0);

  return (
    <div>
      <div className="row spread" style={{ marginBottom: 8 }}>
        <span className="caption">
          {t("keystrokes.summary", { count: buckets.length, keystrokes: total.toLocaleString() })}
        </span>
      </div>
      <div className="chart">
        {buckets.map((b) => (
          <div
            key={b.ts_bucket}
            className="chart-bar"
            title={t("keystrokes.tooltip", {
              time: fmtTime(b.ts_bucket),
              count: b.count.toLocaleString(),
            })}
            style={{ height: `${(b.count / max) * 100}%` }}
          />
        ))}
      </div>
      <div className="caption" style={{ marginTop: 8 }}>
        {t("keystrokes.privacyNote")}
      </div>
    </div>
  );
}
