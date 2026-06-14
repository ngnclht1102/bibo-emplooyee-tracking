import { useEffect, useState } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { Card } from "../ui";

type Shot = {
  ts: number;
  file_path: string;
  display_id: number | null;
  width: number | null;
  height: number | null;
};

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
          ? `Captured ${n} display${n > 1 ? "s" : ""}.`
          : "Captured 0 — is Screen Recording granted? (Permissions tab)"
      );
      await refresh();
    } catch (e) {
      setMsg(`Capture failed: ${e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="row spread" style={{ marginBottom: 16 }}>
        <span className="muted">
          Periodic captures (every 5 min) — and on demand. Needs Screen Recording.
        </span>
        <button className="btn btn-primary" onClick={captureNow} disabled={busy}>
          {busy ? "Capturing…" : "Capture now"}
        </button>
      </div>

      {msg && (
        <div className="muted" style={{ fontSize: 12, marginBottom: 16 }}>
          {msg}
        </div>
      )}

      {shots.length === 0 ? (
        <Card>
          <div className="muted" style={{ fontSize: 12 }}>
            No screenshots yet today. Grant Screen Recording on the Permissions tab,
            then click “Capture now”.
          </div>
        </Card>
      ) : (
        <div className="gallery">
          {shots.map((s, i) => (
            <div className="shot" key={i} title={`${hhmmss(s.ts)} · display ${s.display_id ?? "?"}`}>
              <img
                className="thumb"
                src={convertFileSrc(s.file_path)}
                alt={`screenshot ${hhmmss(s.ts)}`}
                style={{ width: "100%", height: "auto", display: "block" }}
              />
              <div className="cap num">{hhmmss(s.ts)}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
