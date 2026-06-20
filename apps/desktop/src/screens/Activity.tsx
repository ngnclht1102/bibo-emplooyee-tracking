import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { Card, SectionTitle } from "../ui";

const SLOT_S = 1800; // 30-minute display slots

function startOfTodayTs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

function hhmm(ts: number) {
  const d = new Date(ts * 1000);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function Activity() {
  const { t } = useTranslation("screens");
  const [slots, setSlots] = useState<number[]>([]);
  const [dayStart, setDayStart] = useState(startOfTodayTs());
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const from = startOfTodayTs();
      const to = Math.floor(Date.now() / 1000) + 1;
      try {
        const buckets = await invoke<[number, number][]>("keystroke_buckets", {
          fromTs: from,
          toTs: to,
        });
        if (!alive) return;
        const slotCount = Math.max(1, Math.ceil((to - from) / SLOT_S));
        const agg = new Array(slotCount).fill(0);
        let sum = 0;
        for (const [ts, count] of buckets) {
          const i = Math.min(slotCount - 1, Math.floor((ts - from) / SLOT_S));
          agg[i] += count;
          sum += count;
        }
        setSlots(agg);
        setTotal(sum);
        setDayStart(from);
        setNow(to);
      } catch {
        /* ignore transient errors */
      }
    };
    load();
    const id = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const max = Math.max(1, ...slots);

  return (
    <>
      <SectionTitle>{t("activity.title")}</SectionTitle>
      <Card>
        {total === 0 ? (
          <div className="muted" style={{ fontSize: 12 }}>
            {t("activity.empty")}
          </div>
        ) : (
          <>
            <div className="chart">
              {slots.map((b, i) => (
                <div
                  className="chart-bar"
                  key={i}
                  style={{ height: `${(b / max) * 100}%` }}
                  title={`${hhmm(dayStart + i * SLOT_S)} · ${t("activity.keysTooltip", { count: b })}`}
                />
              ))}
            </div>
            <div className="row spread muted" style={{ fontSize: 12, marginTop: 8 }}>
              <span>{hhmm(dayStart)}</span>
              <span>{hhmm(dayStart + Math.floor((now - dayStart) / 2))}</span>
              <span>{hhmm(now)}</span>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
              {t("activity.totalToday", {
                count: total,
                formattedCount: total.toLocaleString(),
              })}
            </div>
          </>
        )}
      </Card>
    </>
  );
}
