import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { call as invoke } from "../../api";
import { StatCard } from "../../ui";
import { EditMemberAction, EditMemberDialog } from "./EditMemberDialog";

export type OwnerBusiness = { id: string; name: string; kind: string };
export type RosterEntry = {
  id: string;
  email: string;
  username: string;
  display_name: string;
  role: string;
  last_seen: number | null;
  active_today_s: number;
  active_yesterday_s: number;
  screenshots_today: number;
  screenshots_yesterday: number;
  focus_pct_today: number | null;
};

/* ── display helpers ── */
function fmtClock(seconds: number): string {
  const s = Math.max(0, seconds | 0);
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
}

type Status = "active" | "idle" | "offline";
function memberStatus(lastSeen: number | null): Status {
  if (!lastSeen) return "offline";
  const age = Date.now() / 1000 - lastSeen;
  if (age < 5 * 60) return "active";
  if (age < 30 * 60) return "idle";
  return "offline";
}

function fmtRelative(unix: number | null, locale: string, never: string): string {
  if (!unix) return never;
  const diff = Math.round(unix - Date.now() / 1000); // negative = past
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "narrow" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

/** The viewer's local midnight (unix seconds) — sent as the roster's `day_start`
 *  so "today" matches the per-employee detail views (which use local days). */
export function localDayStart(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

export const AVATAR_PALETTE = [
  { bg: "var(--accent-weak)", fg: "var(--accent)" },
  { bg: "color-mix(in srgb, var(--data-mint) 20%, transparent)", fg: "var(--data-mint)" },
  { bg: "color-mix(in srgb, var(--data-rose) 18%, transparent)", fg: "var(--data-rose)" },
  { bg: "color-mix(in srgb, var(--data-amber) 22%, transparent)", fg: "var(--data-amber)" },
  { bg: "color-mix(in srgb, var(--data-sky) 20%, transparent)", fg: "var(--data-sky)" },
];

function focusColor(pct: number): string {
  if (pct >= 75) return "var(--data-mint)";
  if (pct >= 60) return "var(--data-amber)";
  return "var(--data-rose)";
}

type Delta = { text: string; dir: "up" | "down" } | null;
function pctDelta(today: number, yesterday: number): Delta {
  if (yesterday <= 0) return null;
  const pct = Math.round(((today - yesterday) / yesterday) * 100);
  return { text: `${Math.abs(pct)}%`, dir: pct >= 0 ? "up" : "down" };
}
function countDelta(today: number, yesterday: number): Delta {
  const diff = today - yesterday;
  if (diff === 0) return null;
  return { text: `${diff > 0 ? "+" : "−"}${Math.abs(diff)}`, dir: diff > 0 ? "up" : "down" };
}

/* ── icons ── */
const svgp = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const IconClock = () => (<svg {...svgp} aria-hidden><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>);
const IconUsers = () => (<svg {...svgp} aria-hidden><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><path d="M16 3.128a4 4 0 0 1 0 7.744" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" /></svg>);
const IconTarget = () => (<svg {...svgp} aria-hidden><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>);
const IconCamera = () => (<svg {...svgp} aria-hidden><path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z" /><circle cx="12" cy="13" r="3" /></svg>);
const IconArrowRight = () => (<svg {...svgp} width="15" height="15" aria-hidden><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>);

// The team dashboard content (page head + stat cards + roster table). The workspace
// picker / account / theme live in the AdminShell topbar; this just renders the data
// for the given business.
export function AdminDashboard({
  businessId,
  businessName,
  onSelectEmployee,
}: {
  businessId: string;
  businessName: string;
  onSelectEmployee: (e: RosterEntry) => void;
}) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<RosterEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<RosterEntry | null>(null);
  // Bumped after an edit so the roster effect refetches the changed member.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!businessId) return;
    setRows(null);
    setError(null);
    invoke<RosterEntry[]>("admin_roster", { businessId, dayStart: localDayStart() })
      .then(setRows)
      .catch((e) => setError(String(e)));
  }, [businessId, reloadKey]);

  const never = t("screens:admin.never");
  const list = rows ?? [];

  const totalRecordedS = list.reduce((s, e) => s + (e.active_today_s || 0), 0);
  const totalYesterdayS = list.reduce((s, e) => s + (e.active_yesterday_s || 0), 0);
  const activeCount = list.filter((e) => memberStatus(e.last_seen) !== "offline").length;
  const focusVals = list.map((e) => e.focus_pct_today).filter((v): v is number => v != null);
  const avgFocus = focusVals.length ? Math.round(focusVals.reduce((a, b) => a + b, 0) / focusVals.length) : null;
  const shots = list.reduce((s, e) => s + (e.screenshots_today || 0), 0);
  const shotsYday = list.reduce((s, e) => s + (e.screenshots_yesterday || 0), 0);
  const recDelta = pctDelta(totalRecordedS, totalYesterdayS);
  const shotDelta = countDelta(shots, shotsYday);


  return (
    <div className="bb-adminboard">
      <div className="bb-adminboard__pagehead">
        <h1 className="bb-adminboard__title">{t("screens:admin.heading")}</h1>
        <p className="bb-adminboard__who">
          {businessName} · {list.length} {t("screens:admin.employees").toLowerCase()}
        </p>
      </div>

      {error && <div className="auth-err" role="alert">{error}</div>}

      <div className="bb-adminboard__stats">
        <StatCard
          focal
          icon={<IconClock />}
          label={t("screens:admin.recorded")}
          value={fmtClock(totalRecordedS)}
          delta={recDelta?.text}
          deltaDir={recDelta?.dir ?? "none"}
          sub={totalYesterdayS > 0 ? t("screens:dashboard.vsYesterday") : t("screens:dashboard.today")}
        />
        <StatCard
          icon={<IconUsers />}
          label={t("screens:admin.activeToday")}
          value={`${activeCount} / ${list.length}`}
          sub={`${list.length} ${t("screens:admin.employees").toLowerCase()}`}
        />
        <StatCard
          icon={<IconTarget />}
          label={t("screens:admin.avgFocus")}
          value={avgFocus == null ? "—" : `${avgFocus}%`}
          sub={t("screens:dashboard.today")}
        />
        <StatCard
          icon={<IconCamera />}
          label={t("screens:admin.screenshots")}
          value={String(shots)}
          delta={shotDelta?.text}
          deltaDir={shotDelta?.dir ?? "none"}
          sub={t("screens:dashboard.today")}
        />
      </div>

      <div className="card bb-adminboard__tablecard">
        {rows === null ? (
          <div className="muted bb-adminboard__msg">{t("loading")}</div>
        ) : rows.length === 0 ? (
          <div className="muted bb-adminboard__msg">{t("screens:admin.empty")}</div>
        ) : (
          <table className="bb-adminboard__table">
            <thead>
              <tr>
                <th>{t("screens:admin.employees")}</th>
                <th>{t("screens:admin.login")}</th>
                <th>{t("screens:admin.lastSeen")}</th>
                <th className="c">{t("screens:admin.colActive")}</th>
                <th className="r">{t("screens:admin.focus")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e, i) => {
                const isSelf = e.role === "owner";
                const status = memberStatus(e.last_seen);
                const pal = AVATAR_PALETTE[i % AVATAR_PALETTE.length];
                const focus = e.focus_pct_today;
                const col = focus == null ? "var(--text-muted)" : focusColor(focus);
                return (
                  <tr key={e.id}>
                    <td>
                      <div className="bb-adminboard__name">
                        <span className="bb-adminboard__avatar" style={{ background: pal.bg, color: pal.fg }}>
                          {initials(e.display_name)}
                          <span className={`bb-adminboard__dot bb-adminboard__dot--${status}`} />
                        </span>
                        <span className="bb-adminboard__nameid">
                          <span className="bb-adminboard__nametxt" title={e.display_name}>
                            {e.display_name}
                          </span>
                          {isSelf && (
                            <span
                              className="bibo-badge bb-adminboard__you"
                              style={{ background: pal.bg, color: pal.fg }}
                            >
                              {t("screens:admin.you")}
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="bb-adminboard__login">{e.email || e.username}</td>
                    <td className="bb-adminboard__relt">{fmtRelative(e.last_seen, i18n.language, never)}</td>
                    <td className="c num">{fmtClock(e.active_today_s)}</td>
                    <td className="r">
                      <span className="bb-adminboard__focus">
                        <span className="num" style={{ color: col }}>{focus == null ? "—" : `${focus}%`}</span>
                      </span>
                    </td>
                    <td className="r">
                      <div className="bb-adminboard__rowacts">
                        {!isSelf && <EditMemberAction onClick={() => setEdit(e)} />}
                        <button type="button" className="bb-adminboard__view" onClick={() => onSelectEmployee(e)}>
                          {t("screens:admin.view")} <IconArrowRight />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {edit && (
        <EditMemberDialog
          businessId={businessId}
          employee={edit}
          onClose={() => setEdit(null)}
          onDone={() => {
            setEdit(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
