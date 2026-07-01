import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { call as invoke } from "../api";
import { useTranslation } from "react-i18next";
import { Card } from "../ui";

type Shot = {
  ts: number;
  file_path: string;
  display_id: number | null;
  width: number | null;
  height: number | null;
};

// Camera glyph for the "Capture now" button (lucide camera).
const CameraIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M14.5 4h-5L8 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-4z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);

function startOfTodayTs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

function hhmmss(ts: number) {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString();
}

export function Screenshots() {
  const { t } = useTranslation("media");
  const [shots, setShots] = useState<Shot[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const rows = await invoke<Shot[]>("screenshot_list", {
        fromTs: startOfTodayTs(),
        toTs: Math.floor(Date.now() / 1000) + 1,
      });
      setShots(rows);
    } catch (e) {
      setMsg(String(e));
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, []);

  async function captureNow() {
    setBusy(true);
    setMsg(null);
    try {
      const n = await invoke<number>("capture_now");
      setMsg(
        n > 0
          ? t("screenshots.captured", { count: n })
          : t("screenshots.capturedZero")
      );
      await refresh();
    } catch (e) {
      setMsg(t("screenshots.captureFailed", { error: String(e) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bb-shots">
      <div className="bb-shots-bar">
        <div className="bb-shots-bar__txt">
          <div className="bb-panel__title">{t("screenshots.title")}</div>
          <div className="bb-panel__sub">{t("screenshots.intro")}</div>
        </div>
        <button
          className="bibo-btn bibo-btn--primary"
          style={{ marginLeft: "auto" }}
          onClick={captureNow}
          disabled={busy}
        >
          <span style={{ display: "inline-flex", lineHeight: 0 }}>
            <CameraIcon />
          </span>
          <span>{busy ? t("screenshots.capturing") : t("screenshots.captureNow")}</span>
        </button>
      </div>

      {msg && (
        <div className="bb-panel__sub" style={{ marginBottom: 12 }}>
          {msg}
        </div>
      )}

      {shots.length === 0 ? (
        <Card>
          <div className="muted" style={{ fontSize: 12 }}>
            {t("screenshots.empty")}
          </div>
        </Card>
      ) : (
        <div className="bb-shots-grid">
          {shots.map((s, i) => (
            <div
              className="bb-shot"
              key={i}
              title={t("screenshots.shotTitle", {
                time: hhmmss(s.ts),
                display: s.display_id ?? "?",
              })}
            >
              <img
                className="bb-shot__img"
                src={convertFileSrc(s.file_path)}
                alt={t("screenshots.shotAlt", { time: hhmmss(s.ts) })}
              />
              <div className="bb-shot__veil" />
              <span className="bb-shot__time">{hhmmss(s.ts)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
