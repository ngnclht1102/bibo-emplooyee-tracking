import { useEffect, useState } from "react";
import { cleanupScreenshots, updateBusinessSettings } from "../api/endpoints";
import { ApiError, type BusinessSettingsPatch } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { BusinessPicker } from "../components/BusinessPicker";
import { Empty, Modal, Notice, Spinner } from "../components/ui";
import { useBusinesses } from "../useBusinesses";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const CLEANUP_PRESETS = [7, 14, 30, 90];

const INTERVAL_PRESETS = [
  { label: "1 min", value: 60 },
  { label: "5 min", value: 300 },
  { label: "10 min", value: 600 },
  { label: "15 min", value: 900 },
];
const IDLE_PRESETS = [
  { label: "1 min", value: 60 },
  { label: "3 min", value: 180 },
  { label: "5 min", value: 300 },
];

// null = "Never" (keep forever).
const PRESETS: { label: string; value: number | null }[] = [
  { label: "7 days", value: 7 },
  { label: "14 days", value: 14 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
  { label: "Never", value: null },
];

export function Settings() {
  const { user } = useAuth();
  const { businesses, selected, selectedId, setSelectedId, loading, reload } = useBusinesses();

  const [retention, setRetention] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "danger"; text: string } | null>(null);

  // Manual "clean up now".
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cleanupDays, setCleanupDays] = useState(30);
  const [cleaning, setCleaning] = useState(false);

  useEffect(() => {
    if (selected) setRetention(selected.screenshot_retention_days);
  }, [selected]);

  async function runCleanup() {
    if (!selectedId) return;
    setCleaning(true);
    setMsg(null);
    try {
      const res = await cleanupScreenshots(selectedId, cleanupDays);
      setMsg({
        kind: "success",
        text: `Removed ${res.deleted_count} screenshot${
          res.deleted_count === 1 ? "" : "s"
        } (${formatBytes(res.bytes_freed)} freed).`,
      });
    } catch (err) {
      setMsg({
        kind: "danger",
        text: err instanceof ApiError ? err.message : "Cleanup failed.",
      });
    } finally {
      setCleaning(false);
      setConfirmOpen(false);
    }
  }

  async function savePatch(patch: BusinessSettingsPatch, successText: string) {
    if (!selectedId) return;
    setSaving(true);
    setMsg(null);
    try {
      await updateBusinessSettings(selectedId, patch);
      await reload();
      setMsg({ kind: "success", text: successText });
    } catch (err) {
      setMsg({
        kind: "danger",
        text: err instanceof ApiError ? err.message : "Could not save settings.",
      });
    } finally {
      setSaving(false);
    }
  }

  function saveRetention(value: number | null) {
    setRetention(value);
    savePatch({ screenshot_retention_days: value }, "Screenshot retention updated.");
  }

  return (
    <div>
      <div className="toolbar spread" style={{ justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "var(--fz-lg)", margin: 0 }}>Settings</h1>
        <BusinessPicker businesses={businesses} selectedId={selectedId} onChange={setSelectedId} />
      </div>

      {selected && (
        <p className="muted" style={{ marginTop: 0, marginBottom: 16 }}>
          These apply to <strong>{selected.name}</strong> and all its employees — not your other
          businesses. Use the picker (top-right) to configure a different one.
        </p>
      )}

      {loading && <Spinner label="Loading…" />}

      {!loading && businesses.length === 0 && <Empty>No businesses to configure yet.</Empty>}

      {selected && (
        <>
          <div className="set-group" style={{ marginBottom: 24 }}>
            <div className="set-row">
              <div>
                <div className="set-title">Capture policy</div>
                <div className="set-desc">
                  These apply to every employee's app on {selected.name}. When employee
                  overrides are off, employees can't change them on their machine.
                </div>
              </div>
              <div className="segmented" role="group" aria-label="Allow employee override">
                <button
                  className={!selected.allow_employee_override ? "active" : ""}
                  disabled={saving}
                  onClick={() => savePatch({ allow_employee_override: false }, "Employees can't change capture settings.")}
                >
                  Locked
                </button>
                <button
                  className={selected.allow_employee_override ? "active" : ""}
                  disabled={saving}
                  onClick={() => savePatch({ allow_employee_override: true }, "Employees may change capture settings.")}
                >
                  Allow override
                </button>
              </div>
            </div>

            <div className="set-row">
              <div>
                <div className="set-title">Screenshot interval</div>
                <div className="set-desc">How often each employee's screen is captured.</div>
              </div>
              <div className="segmented" role="group" aria-label="Screenshot interval">
                {INTERVAL_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    className={selected.screenshot_interval_s === p.value ? "active" : ""}
                    disabled={saving}
                    onClick={() => savePatch({ screenshot_interval_s: p.value }, "Screenshot interval updated.")}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="set-row">
              <div>
                <div className="set-title">Idle threshold</div>
                <div className="set-desc">No input for this long pauses active-time counting.</div>
              </div>
              <div className="segmented" role="group" aria-label="Idle threshold">
                {IDLE_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    className={selected.idle_threshold_s === p.value ? "active" : ""}
                    disabled={saving}
                    onClick={() => savePatch({ idle_threshold_s: p.value }, "Idle threshold updated.")}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="set-group" style={{ marginBottom: 24 }}>
            <div className="set-row">
              <div>
                <div className="set-title">Screenshot retention</div>
                <div className="set-desc">
                  How long the backend keeps uploaded screenshots for {selected.name}. "Never" keeps
                  them indefinitely.
                </div>
              </div>
              <div className="segmented" role="group" aria-label="Retention">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    className={retention === p.value ? "active" : ""}
                    disabled={saving}
                    onClick={() => saveRetention(p.value)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="set-group" style={{ marginBottom: 24 }}>
            <div className="set-row">
              <div>
                <div className="set-title">Clean up screenshots now</div>
                <div className="set-desc">
                  Immediately delete {selected.name}'s screenshots (files and records) older
                  than the chosen age. This cannot be undone.
                </div>
              </div>
              <button className="btn" disabled={cleaning} onClick={() => setConfirmOpen(true)}>
                Clean up now…
              </button>
            </div>
          </div>

          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        </>
      )}

      {confirmOpen && selected && (
        <Modal title="Clean up screenshots" onClose={() => setConfirmOpen(false)}>
          <p className="muted" style={{ marginTop: 0 }}>
            Delete screenshots for <strong>{selected.name}</strong> older than:
          </p>
          <div className="segmented" role="group" aria-label="Older than" style={{ marginBottom: 16 }}>
            {CLEANUP_PRESETS.map((d) => (
              <button
                key={d}
                className={cleanupDays === d ? "active" : ""}
                onClick={() => setCleanupDays(d)}
              >
                {d} days
              </button>
            ))}
          </div>
          <p className="muted">
            Files and records older than {cleanupDays} days are permanently removed. This
            cannot be undone.
          </p>
          <div className="toolbar" style={{ justifyContent: "flex-end", gap: 8 }}>
            <button className="btn btn-ghost" disabled={cleaning} onClick={() => setConfirmOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={cleaning} onClick={runCleanup}>
              {cleaning ? "Cleaning…" : `Delete older than ${cleanupDays} days`}
            </button>
          </div>
        </Modal>
      )}

      <div className="set-group" style={{ marginTop: 24 }}>
        <div className="set-row">
          <div>
            <div className="set-title">Account</div>
            <div className="set-desc">{user?.email}</div>
          </div>
          <span className="muted">{user?.display_name}</span>
        </div>
      </div>
    </div>
  );
}
