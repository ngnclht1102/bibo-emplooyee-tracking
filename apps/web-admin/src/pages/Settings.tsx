import { useEffect, useState } from "react";
import { updateBusinessSettings } from "../api/endpoints";
import { ApiError } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { BusinessPicker } from "../components/BusinessPicker";
import { Empty, Notice, Spinner } from "../components/ui";
import { useBusinesses } from "../useBusinesses";

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

  useEffect(() => {
    if (selected) setRetention(selected.screenshot_retention_days);
  }, [selected]);

  async function save(value: number | null) {
    if (!selectedId) return;
    setRetention(value);
    setSaving(true);
    setMsg(null);
    try {
      await updateBusinessSettings(selectedId, value);
      await reload();
      setMsg({ kind: "success", text: "Screenshot retention updated." });
    } catch (err) {
      setMsg({
        kind: "danger",
        text: err instanceof ApiError ? err.message : "Could not save settings.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="toolbar spread" style={{ justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "var(--fz-lg)", margin: 0 }}>Settings</h1>
        <BusinessPicker businesses={businesses} selectedId={selectedId} onChange={setSelectedId} />
      </div>

      {loading && <Spinner label="Loading…" />}

      {!loading && businesses.length === 0 && <Empty>No businesses to configure yet.</Empty>}

      {selected && (
        <>
          <div className="set-group" style={{ marginBottom: 24 }}>
            <div className="set-row">
              <div>
                <div className="set-title">Screenshot retention</div>
                <div className="set-desc">
                  How long the backend keeps uploaded screenshots for {selected.name}. "Never" keeps
                  them indefinitely. Applies to the backend replica only.
                </div>
              </div>
              <div className="segmented" role="group" aria-label="Retention">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    className={retention === p.value ? "active" : ""}
                    disabled={saving}
                    onClick={() => save(p.value)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        </>
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
