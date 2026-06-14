import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export type AppSettings = {
  theme: string;
  idle_threshold_s: number;
  screenshot_interval_s: number;
  screenshot_retention_days: number;
  domain_only: boolean;
  hide_dock: boolean;
};

type FileResult = { name: string; rows: number };
type ExportSummary = { dir: string; files: FileResult[] };
type BrowserLinkInfo = { port: number | null; token_active: boolean };

function Row({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="set-row">
      <div>
        <div className="set-title">{title}</div>
        {desc && <div className="set-desc">{desc}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function NumSelect({
  value,
  options,
  onChange,
}: {
  value: number;
  options: { label: string; value: number }[];
  onChange: (v: number) => void;
}) {
  return (
    <select
      className="btn"
      value={value}
      onChange={(e) => onChange(Number(e.currentTarget.value))}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Settings({
  settings,
  onChange,
  onOpenPermissions,
}: {
  settings: AppSettings | null;
  onChange: (patch: Partial<AppSettings>) => void;
  onOpenPermissions: () => void;
}) {
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [link, setLink] = useState<BrowserLinkInfo | null>(null);

  useEffect(() => {
    invoke<BrowserLinkInfo>("browser_link").then(setLink).catch(() => {});
  }, []);

  async function runExport(kind: "csv" | "json") {
    setExportMsg(null);
    const dir = await open({ directory: true, title: "Choose export folder" });
    if (!dir || typeof dir !== "string") return;
    setExporting(true);
    try {
      const cmd = kind === "csv" ? "export_csv" : "export_json";
      const summary = await invoke<ExportSummary>(cmd, {
        dir,
        fromTs: 0,
        toTs: Math.floor(Date.now() / 1000) + 86400,
      });
      const total = summary.files.reduce((n, f) => n + f.rows, 0);
      setExportMsg(`Exported ${summary.files.length} file(s), ${total} rows to ${summary.dir}`);
    } catch (e) {
      setExportMsg(`Export failed: ${e}`);
    } finally {
      setExporting(false);
    }
  }

  if (!settings) {
    return <div className="muted">Loading settings…</div>;
  }

  return (
    <div style={{ maxWidth: 680, display: "flex", flexDirection: "column", gap: 24 }}>
      <section>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>General</div>
        <div className="set-group">
          <Row
            title="Hide from Dock"
            desc="Run as a menu-bar-only app. Closing the window keeps it running in the menu bar."
          >
            <button
              className={`switch ${settings.hide_dock ? "" : "off"}`}
              onClick={() => onChange({ hide_dock: !settings.hide_dock })}
            />
          </Row>
        </div>
      </section>

      <section>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Capture</div>
        <div className="set-group">
          <Row title="Screenshot interval" desc="How often screens are captured">
            <NumSelect
              value={settings.screenshot_interval_s}
              onChange={(v) => onChange({ screenshot_interval_s: v })}
              options={[
                { label: "1 min", value: 60 },
                { label: "5 min", value: 300 },
                { label: "10 min", value: 600 },
                { label: "15 min", value: 900 },
              ]}
            />
          </Row>
          <Row title="Idle threshold" desc="No input for this long pauses time counting">
            <NumSelect
              value={settings.idle_threshold_s}
              onChange={(v) => onChange({ idle_threshold_s: v })}
              options={[
                { label: "60 sec", value: 60 },
                { label: "3 min", value: 180 },
                { label: "5 min", value: 300 },
              ]}
            />
          </Row>
          <Row title="Screenshot retention" desc="Auto-delete captures older than this">
            <NumSelect
              value={settings.screenshot_retention_days}
              onChange={(v) => onChange({ screenshot_retention_days: v })}
              options={[
                { label: "7 days", value: 7 },
                { label: "30 days", value: 30 },
                { label: "90 days", value: 90 },
              ]}
            />
          </Row>
        </div>
      </section>

      <section>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Privacy</div>
        <div className="set-group">
          <Row title="Store domain only" desc="Record example.com instead of the full URL">
            <button
              className={`switch ${settings.domain_only ? "" : "off"}`}
              onClick={() => onChange({ domain_only: !settings.domain_only })}
            />
          </Row>
          <Row title="Permissions" desc="Accessibility, Input Monitoring, Screen Recording">
            <button className="btn" onClick={onOpenPermissions}>
              Manage →
            </button>
          </Row>
        </div>
      </section>

      <section>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Browser link</div>
        <div className="set-group">
          <Row title="Ingest port" desc="Extension auto-discovers this">
            <span className="num muted">
              {link ? (link.port ? `127.0.0.1 : ${link.port}` : "no free port") : "…"}
            </span>
          </Row>
          <Row title="Pairing token" desc="Shared secret for the extension">
            <span className={`pill ${link?.token_active ? "pill-success" : "pill-danger"}`}>
              {link?.token_active ? "● Active" : "▲ none"}
            </span>
          </Row>
        </div>
      </section>

      <section>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Export</div>
        <div className="row">
          <button className="btn btn-primary" onClick={() => runExport("csv")} disabled={exporting}>
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
          <button className="btn" onClick={() => runExport("json")} disabled={exporting}>
            Export JSON
          </button>
        </div>
        {exportMsg && (
          <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            {exportMsg}
          </div>
        )}
      </section>
    </div>
  );
}
