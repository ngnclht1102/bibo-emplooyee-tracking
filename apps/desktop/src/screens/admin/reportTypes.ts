// Shapes returned by the admin per-employee report commands (mirror the Rust
// structs in src-tauri/src/sync/client.rs). Shared by EmployeeDetail + panels.

export type ActivitySampleRow = {
  ts: number;
  app_name: string;
  window_title: string | null;
  duration_s: number;
};
export type ActivityBreakdownRow = { app_name: string; duration_s: number };
export type EmployeeActivity = {
  samples: ActivitySampleRow[];
  breakdown: ActivityBreakdownRow[];
};
export type KeystrokeBucketRow = { ts_bucket: number; count: number };
export type BrowserVisitRow = {
  ts: number;
  url: string;
  page_title: string | null;
  browser: string | null;
  duration_s: number;
};
export type ScreenshotMetaRow = {
  client_uuid: string;
  ts: number;
  byte_size: number;
  width: number | null;
  height: number | null;
  display_id: number | null;
};

/* ── shared display helpers ── */
export const fmtHM = (s: number) => {
  const v = Math.max(0, s);
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
};
export const hhmm = (ts: number) => {
  const d = new Date(ts * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
export const hhmmss = (ts: number) => {
  const d = new Date(ts * 1000);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((x) => String(x).padStart(2, "0"))
    .join(":");
};
export const fmtBytes = (n: number) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};
