import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { reportEmployees } from "../api/endpoints";
import type { ReportEmployee } from "../api/types";
import { Empty, Notice, Spinner } from "../components/ui";
import { EditEmployeeModal, EditMemberAction } from "../components/EditEmployeeModal";
import { fmtRelative } from "../format";
import { useBusinesses } from "../useBusinesses";
import { memberTerms } from "../terms";
import { useAuth } from "../auth/AuthContext";

// ── display-only helpers ─────────────────────────────────────────────
/** Duration as H:MM for the dashboard cards/rows (design uses "7:27", not "7h 27m").
 *  Local & display-only — the shared fmtDuration is left untouched. */
function fmtClock(seconds: number): string {
  const s = Math.max(0, seconds | 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

type Status = "active" | "idle" | "offline";
export function memberStatus(lastSeen: number | null): Status {
  if (!lastSeen) return "offline";
  const ageS = Date.now() / 1000 - lastSeen;
  if (ageS < 5 * 60) return "active";
  if (ageS < 30 * 60) return "idle";
  return "offline";
}

const AVATAR_PALETTE = [
  { bg: "var(--info-soft)", fg: "var(--info)" },
  { bg: "var(--positive-soft)", fg: "var(--positive)" },
  { bg: "color-mix(in srgb, var(--data-rose) 18%, transparent)", fg: "var(--data-rose)" },
  { bg: "color-mix(in srgb, var(--data-amber) 22%, transparent)", fg: "var(--data-amber)" },
];
const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

function focusColor(pct: number): string {
  if (pct >= 75) return "var(--positive)";
  if (pct >= 60) return "var(--data-amber)";
  return "var(--negative)";
}

// ── inline icons (no icon dependency in web-admin) ───────────────────
const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const IconClock = svg(<><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>);
const IconUsers = svg(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><path d="M16 3.128a4 4 0 0 1 0 7.744" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" /></>);
const IconTarget = svg(<><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>);
const IconCamera = svg(<><path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z" /><circle cx="12" cy="13" r="3" /></>);
const IconArrowRight = svg(<><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>);
const TrendUp = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
    <path d="M7 17 17 7M9 7h8v8" />
  </svg>
);
const TrendDown = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
    <path d="M7 7 17 17M17 9v8H9" />
  </svg>
);

/** Real vs-yesterday delta, or null to hide the badge (no data to compare). */
type Delta = { text: string; up: boolean } | null;

/** Percent change today vs yesterday; hidden when there was nothing yesterday. */
function pctDelta(today: number, yesterday: number): Delta {
  if (yesterday <= 0) return null;
  const pct = Math.round(((today - yesterday) / yesterday) * 100);
  return { text: `${Math.abs(pct)}%`, up: pct >= 0 };
}

/** Absolute-count change today vs yesterday; hidden when unchanged. */
function countDelta(today: number, yesterday: number): Delta {
  const diff = today - yesterday;
  if (diff === 0) return null;
  return { text: `${diff > 0 ? "+" : "−"}${Math.abs(diff)}`, up: diff > 0 };
}

// ── stat card ────────────────────────────────────────────────────────
export function StatCard(props: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  focal?: boolean;
  delta?: Delta;
  sub?: string;
}) {
  const { icon, label, value, focal, delta, sub } = props;
  return (
    <div className={`bibo-card ${focal ? "bibo-card--focal" : "bibo-card--default"} admin-cardpad`}>
      <div className={`bibo-stat${focal ? " bibo-stat--focal" : ""}`}>
        <div className="bibo-stat__top">
          <div className="bibo-stat__icon">{icon}</div>
          <div className="bibo-stat__label">{label}</div>
        </div>
        <div className="bibo-stat__value">{value}</div>
        <div className="bibo-stat__foot">
          {delta && (
            <span className={`bibo-stat__delta bibo-stat__delta--${delta.up ? "up" : "down"}`}>
              {delta.up ? TrendUp : TrendDown}
              {delta.text}
            </span>
          )}
          {sub && <span className="bibo-stat__sub">{sub}</span>}
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { t } = useTranslation("dashboard");
  const navigate = useNavigate();
  const { user } = useAuth();
  const { businesses, selected, selectedId, loading: bizLoading } = useBusinesses();
  const terms = memberTerms(selected?.kind);
  const [rows, setRows] = useState<ReportEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ReportEmployee | null>(null);
  // Bumped after an edit so the roster effect refetches the changed member.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!selectedId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    reportEmployees(selectedId)
      .then((r) => !cancelled && setRows(r.employees))
      .catch(() => !cancelled && setError(t("dashboard.errorRoster")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedId, reloadKey]);

  // ── derived metrics for the stat cards ──
  const totalRecordedS = rows.reduce((s, e) => s + (e.active_today_s || 0), 0);
  const totalYesterdayS = rows.reduce((s, e) => s + (e.active_yesterday_s || 0), 0);
  const activeCount = rows.filter((e) => memberStatus(e.last_seen) !== "offline").length;
  const focusVals = rows.map((e) => e.focus_pct_today).filter((v): v is number => v != null);
  const avgFocus = focusVals.length
    ? Math.round(focusVals.reduce((a, b) => a + b, 0) / focusVals.length)
    : null;
  const screenshotCount = rows.reduce((s, e) => s + (e.screenshots_today || 0), 0);
  const screenshotsYday = rows.reduce((s, e) => s + (e.screenshots_yesterday || 0), 0);

  return (
    <div className="admin-wrap" style={{ paddingBottom: 32 }}>
      <div className="admin-pagehead">
        <div className="admin-pagehead__main">
          <h1 className="admin-h1">{t("dashboard.title")}</h1>
          {selected && (
            <p className="admin-sub">
              {selected.name} · {rows.length} {terms.many}
            </p>
          )}
        </div>
      </div>

      {bizLoading && <Spinner label={t("dashboard.loadingBusinesses")} />}

      {!bizLoading && businesses.length === 0 && (
        <Empty>
          <Trans
            i18nKey="dashboard.noBusinesses"
            t={t}
            values={{ members: terms.many, member: terms.lowerOne }}
            components={[<Link to="/employees" />]}
          />
        </Empty>
      )}

      {error && <Notice kind="danger">{error}</Notice>}
      {loading && <Spinner label={t("dashboard.loadingRoster")} />}

      {!loading && !error && selectedId && rows.length === 0 && (
        <Empty>{t("dashboard.noActivity", { members: terms.lowerMany })}</Empty>
      )}

      {rows.length > 0 && (
        <>
          <div className="admin-stats">
            <StatCard
              focal
              icon={IconClock}
              label={t("dashboard.statRecorded")}
              value={fmtClock(totalRecordedS)}
              delta={pctDelta(totalRecordedS, totalYesterdayS)}
              sub={totalYesterdayS > 0 ? t("dashboard.vsYesterday") : t("dashboard.todayLabel")}
            />
            <StatCard
              icon={IconUsers}
              label={t("dashboard.statActive")}
              value={`${activeCount} / ${rows.length}`}
              sub={t("dashboard.ofMembers", { count: rows.length, members: terms.many })}
            />
            <StatCard
              icon={IconTarget}
              label={t("dashboard.statFocus")}
              value={avgFocus == null ? "—" : <>{avgFocus}<span className="bibo-stat__unit">%</span></>}
              sub={t("dashboard.todayLabel")}
            />
            <StatCard
              icon={IconCamera}
              label={t("dashboard.statScreenshots")}
              value={screenshotCount}
              delta={countDelta(screenshotCount, screenshotsYday)}
              sub={t("dashboard.todayLabel")}
            />
          </div>

          <div className="bibo-card bibo-card--default admin-tablecard">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("dashboard.table.name")}</th>
                  <th>{t("dashboard.table.login")}</th>
                  <th>{t("dashboard.table.lastSeen")}</th>
                  <th className="r">{t("dashboard.table.activeToday")}</th>
                  <th className="r">{t("dashboard.table.focus")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e, i) => {
                  const isSelf = e.role === "owner" || e.id === user?.id;
                  const status = memberStatus(e.last_seen);
                  const pal = AVATAR_PALETTE[i % AVATAR_PALETTE.length];
                  const focus = e.focus_pct_today;
                  const col = focus == null ? "var(--text-muted)" : focusColor(focus);
                  return (
                    <tr key={e.id}>
                      <td>
                        <div className="admin-name">
                          <span className="bibo-avatar" style={{ ["--_s" as string]: "34px" }}>
                            <span className="bibo-avatar__img" aria-label={e.display_name} style={{ background: pal.bg, color: pal.fg }}>
                              {initials(e.display_name)}
                            </span>
                            <span className={`bibo-avatar__dot bibo-avatar__dot--${status}`} />
                          </span>
                          <span className="admin-name__txt">
                            {e.display_name}
                            {isSelf && <span className="admin-self">{t("dashboard.selfBadge")}</span>}
                          </span>
                        </div>
                      </td>
                      <td className="admin-login">{e.email || e.username}</td>
                      <td className="admin-relt">{fmtRelative(e.last_seen)}</td>
                      <td className="r admin-dur">{fmtClock(e.active_today_s)}</td>
                      <td className="r">
                        <span className="admin-rowprod">
                          <span className="admin-rowprod__pct" style={{ color: col }}>{focus == null ? "—" : `${focus}%`}</span>
                        </span>
                      </td>
                      <td className="r">
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 16 }}>
                          {!isSelf && (
                            <EditMemberAction label={t("employees.edit")} onClick={() => setEditing(e)} />
                          )}
                          <button
                            type="button"
                            className="admin-viewlink"
                            onClick={() => navigate(`/employees/${e.id}?business=${selectedId}`)}
                          >
                            {t("dashboard.view")}
                            {IconArrowRight}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {editing && selectedId && (
        <EditEmployeeModal
          businessId={selectedId}
          employee={editing}
          terms={terms}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
