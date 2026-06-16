// Small formatting helpers. Tabular figures handle alignment in CSS (.num).

export function fmtDuration(seconds: number): string {
  if (!seconds || seconds < 0) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}

export function fmtRelative(unixSeconds: number | null): string {
  if (!unixSeconds) return "Never";
  const diff = Date.now() / 1000 - unixSeconds;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(unixSeconds * 1000).toLocaleDateString();
}

export function fmtTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// Unix-second bounds for a YYYY-MM-DD date input (local time, inclusive end).
export function dayRangeToUnix(fromDate: string, toDate: string): { from: number; to: number } {
  const from = Math.floor(new Date(`${fromDate}T00:00:00`).getTime() / 1000);
  const to = Math.floor(new Date(`${toDate}T23:59:59`).getTime() / 1000);
  return { from, to };
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}
