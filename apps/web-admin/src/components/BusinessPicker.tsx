import type { Business } from "../api/types";

// Renders nothing if the owner has 0 or 1 business; otherwise a compact select.
export function BusinessPicker({
  businesses,
  selectedId,
  onChange,
}: {
  businesses: Business[];
  selectedId: string | null;
  onChange: (id: string) => void;
}) {
  if (businesses.length <= 1) return null;
  return (
    <label className="row" style={{ gap: 8 }}>
      <span className="caption">Business</span>
      <select
        className="input"
        style={{ width: "auto" }}
        value={selectedId ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        {businesses.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </label>
  );
}
