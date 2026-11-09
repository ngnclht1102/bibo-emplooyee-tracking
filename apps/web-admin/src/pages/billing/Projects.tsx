import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { billingApi, type BillingMember, type Project } from "../../api/billing";
import { Empty, Notice, Spinner } from "../../components/ui";
import { useBusinesses } from "../../useBusinesses";
import {
  AvatarStack, Dialog, DialogFoot, IconFolder, IconPlus, TextField, centsToInput, errText, fmtMoney, ic,
  localDay, parseMoney,
} from "./common";
import { BillingGate } from "./BillingGate";

/** The projects the team books time against. Time on a billable project can go on a
 *  member's invoice. A project rate only fills in for people who have no rate of their
 *  own, unless the owner ticks "use this rate for everyone" (ticket 167). Archiving
 *  hides a project from the desktop app.
 *  Ticket 163: a project is open to the whole workspace by default, or limited to
 *  selected people — managed per project in the dialog, or for the whole team in the
 *  "Who works on what" grid. Owners always have access. */
export function Projects() {
  return <BillingGate>{(biz) => <ProjectsInner biz={biz} />}</BillingGate>;
}

/** Can this member work on the project? (The backend applies the same rule.) */
export const canWork = (p: Project, m: BillingMember) =>
  m.role === "owner" || !p.restricted || p.member_ids.includes(m.id);

function ProjectsInner({ biz }: { biz: string }) {
  const { t } = useTranslation("billing");
  const { selected } = useBusinesses();
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<BillingMember[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"list" | "grid">("list");
  const [editProject, setEditProject] = useState<Project | "new" | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([billingApi.projects(biz), billingApi.settings(biz), billingApi.members(biz, localDay())])
      .then(([p, s, m]) => {
        setProjects(p.projects);
        setCurrency(s.currency);
        setMembers(m.members);
      })
      .catch((e) => setError(errText(e, t("common.loadError"))))
      .finally(() => setLoading(false));
  }, [biz, t]);
  useEffect(load, [load]);

  const patch = (p: Project) => setProjects((cur) => cur.map((x) => (x.id === p.id ? p : x)));
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  return (
    <div className="admin-wrap" style={{ paddingBottom: 32 }}>
      <div className="admin-pagehead">
        <div className="admin-pagehead__main">
          <h1 className="admin-h1">{t("projects.title")}</h1>
          <p className="admin-sub">
            {selected?.name} · {t("projects.counts", { projects: projects.length })}
          </p>
        </div>
        <div className="admin-pagehead__actions">
          <button className="bibo-btn bibo-btn--primary" onClick={() => setEditProject("new")}>
            {ic(IconPlus)}
            <span>{t("projects.new")}</span>
          </button>
        </div>
      </div>

      <div className="bill-filters">
        <div className="bibo-tabs bibo-tabs--pill" role="tablist">
          {(["list", "grid"] as const).map((x) => (
            <button key={x} type="button" role="tab" aria-selected={tab === x}
              className={`bibo-tab${tab === x ? " bibo-tab--on" : ""}`} onClick={() => setTab(x)}>
              {t(`projects.tab.${x}`)}
            </button>
          ))}
        </div>
      </div>

      {error && <Notice kind="danger">{error}</Notice>}
      {loading && <Spinner label={t("common.loading")} />}

      {!loading && (projects.length === 0 ? (
        <Empty>{t("projects.empty")}</Empty>
      ) : tab === "grid" ? (
        <AccessGrid biz={biz} projects={projects} members={members} onPatch={patch} />
      ) : (
        <div className="bibo-card bibo-card--default admin-tablecard">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("projects.col.name")}</th>
                <th>{t("projects.col.billing")}</th>
                <th className="r">{t("projects.col.rate")}</th>
                <th>{t("projects.col.access")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.name}
                    {p.archived && <span className="bill-sub">{t("common.archived")}</span>}
                  </td>
                  <td>
                    {p.billable ? (
                      <span className="pill pill-success">{t("projects.billable")}</span>
                    ) : (
                      <span className="pill">{t("projects.notBillable")}</span>
                    )}
                  </td>
                  <td className="r">
                    {p.rate_cents != null ? (
                      <>
                        <span className="num">{fmtMoney(p.rate_cents, currency)}{t("common.perHour")}</span>
                        {!p.rate_overrides_members && <span className="bill-sub">{t("projects.rateFallback")}</span>}
                      </>
                    ) : <span className="bill-muted">{t("projects.memberRates")}</span>}
                  </td>
                  <td>
                    <AccessCell project={p} byId={byId} onManage={() => setEditProject(p)} />
                  </td>
                  <td className="r">
                    <button type="button" className="admin-viewlink" onClick={() => setEditProject(p)}>{t("common.edit")}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {editProject && (
        <ProjectDialog biz={biz} project={editProject === "new" ? null : editProject} currency={currency} members={members}
          onClose={() => setEditProject(null)} onSaved={() => { setEditProject(null); load(); }} />
      )}
    </div>
  );
}

/** "All members", or the people on a limited project. */
function AccessCell({ project, byId, onManage }: {
  project: Project;
  byId: Map<string, BillingMember>;
  onManage: () => void;
}) {
  const { t } = useTranslation("billing");
  if (!project.restricted) return <span className="bill-muted">{t("projects.accessAll")}</span>;
  const people = project.member_ids.map((id) => byId.get(id)).filter((m): m is BillingMember => !!m);
  return (
    <button type="button" className="bill-accesscell" onClick={onManage}>
      <AvatarStack people={people} />
      <span>{t("projects.accessCount", { count: people.length })}</span>
    </button>
  );
}

/** Members × projects. One tick puts someone on a limited project; open projects are
 *  shown as available to everyone and can be limited from the column header. */
function AccessGrid({ biz, projects, members, onPatch }: {
  biz: string;
  projects: Project[];
  members: BillingMember[];
  onPatch: (p: Project) => void;
}) {
  const { t } = useTranslation("billing");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = projects.filter((p) => !p.archived);

  async function save(p: Project, next: Partial<Project>) {
    setBusy(p.id);
    setError(null);
    try {
      onPatch(await billingApi.saveProject(biz, { ...p, ...next }));
    } catch (e) {
      setError(errText(e, t("common.saveError")));
    } finally {
      setBusy(null);
    }
  }
  const toggle = (p: Project, userID: string) =>
    save(p, {
      member_ids: p.member_ids.includes(userID)
        ? p.member_ids.filter((x) => x !== userID)
        : [...p.member_ids, userID],
    });

  if (active.length === 0) return <Empty>{t("projects.grid.empty")}</Empty>;

  return (
    <div className="bill-stack">
      {error && <Notice kind="danger">{error}</Notice>}
      <p className="bill-hint">{t("projects.grid.hint")}</p>
      <div className="bibo-card bibo-card--default admin-tablecard">
        <table className="admin-table bill-grid">
          <thead>
            <tr>
              <th>{t("projects.grid.member")}</th>
              {active.map((p) => (
                <th key={p.id} className="c">
                  <span className="bill-grid__name">{p.name}</span>
                  <select className="bill-grid__mode" value={p.restricted ? "limited" : "open"} disabled={busy === p.id}
                    aria-label={`${p.name} · ${t("projects.accessTitle")}`}
                    onChange={(e) => save(p, { restricted: e.target.value === "limited" })}>
                    <option value="open">{t("projects.grid.modeOpen")}</option>
                    <option value="limited">{t("projects.grid.modeLimited")}</option>
                  </select>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>
                  {m.name}
                  <span className="bill-sub">{t(`rates.role.${m.role}`)}</span>
                </td>
                {active.map((p) => (
                  <td key={p.id} className="c">
                    {!p.restricted ? (
                      <span className="bill-grid__all" title={t("projects.grid.modeOpen")} aria-label={t("projects.grid.modeOpen")}>✓</span>
                    ) : m.role === "owner" ? (
                      <input type="checkbox" checked disabled title={t("projects.ownerAlways")} />
                    ) : (
                      <input type="checkbox" checked={p.member_ids.includes(m.id)} disabled={busy === p.id}
                        aria-label={`${m.name} · ${p.name}`} onChange={() => toggle(p, m.id)} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProjectDialog({
  biz, project, currency, members, onClose, onSaved,
}: {
  biz: string;
  project: Project | null;
  currency: string;
  members: BillingMember[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation("billing");
  const [name, setName] = useState(project?.name ?? "");
  const [billable, setBillable] = useState(project?.billable ?? true);
  const [rate, setRate] = useState(centsToInput(project?.rate_cents));
  const [rateOverrides, setRateOverrides] = useState(project?.rate_overrides_members ?? false);
  const [archived, setArchived] = useState(project?.archived ?? false);
  const [restricted, setRestricted] = useState(project?.restricted ?? false);
  const [picked, setPicked] = useState<string[]>(project?.member_ids ?? []);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const staff = members.filter((m) => m.role !== "owner");
  const shown = staff.filter((m) => {
    const q = search.trim().toLowerCase();
    return !q || m.name.toLowerCase().includes(q) || m.login.toLowerCase().includes(q);
  });
  const toggle = (id: string) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  async function save() {
    const cents = rate.trim() ? parseMoney(rate) : null;
    if (rate.trim() && cents == null) return setError(t("common.badMoney"));
    setBusy(true);
    setError(null);
    try {
      await billingApi.saveProject(biz, {
        id: project?.id, name, billable, rate_cents: cents, rate_overrides_members: cents != null && rateOverrides,
        archived, restricted, member_ids: picked,
      });
      onSaved();
    } catch (e) {
      setError(errText(e, t("common.saveError")));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!project || !window.confirm(t("projects.confirmDelete"))) return;
    try {
      await billingApi.deleteProject(biz, project.id);
      onSaved();
    } catch (e) {
      setError(errText(e, t("common.saveError")));
    }
  }

  return (
    <Dialog icon={IconFolder} title={project ? t("projects.editTitle") : t("projects.new")} width={540} onClose={onClose} onSubmit={save} error={error}
      foot={<DialogFoot onClose={onClose} busy={busy} label={t("common.save")} disabled={!name.trim()}
        extra={project && <button type="button" className="bibo-btn bibo-btn--ghost" onClick={remove}>{t("common.delete")}</button>} />}>
      <TextField label={t("projects.col.name")} value={name} onChange={setName} required autoFocus />
      <TextField label={t("projects.rateLabel", { currency })} value={rate} onChange={setRate} placeholder={t("projects.ratePlaceholder")}
        hint={t("projects.rateHint")} />
      {rate.trim() !== "" && (
        <label className="bill-check">
          <input type="checkbox" checked={rateOverrides} onChange={(e) => setRateOverrides(e.target.checked)} />
          <span>
            {t("projects.rateOverrideLabel")}
            <span className="bill-sub">{t("projects.rateOverrideHint")}</span>
          </span>
        </label>
      )}
      <label className="bill-check">
        <input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} />
        {t("projects.billableLabel")}
      </label>

      <div className="bill-access">
        <span className="bill-doc__lbl">{t("projects.accessTitle")}</span>
        {([false, true] as const).map((v) => (
          <label key={String(v)} className={`bill-choice${restricted === v ? " bill-choice--on" : ""}`}>
            <input type="radio" name="project-access" checked={restricted === v} onChange={() => setRestricted(v)} />
            <span>
              {v ? t("projects.limitLabel") : t("projects.openLabel")}
              <span className="bill-sub">{v ? t("projects.limitHint") : t("projects.openHint")}</span>
            </span>
          </label>
        ))}

        {restricted && (
          <>
            {staff.length > 8 && (
              <span className="bibo-input bill-search">
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("projects.searchPeople")} />
              </span>
            )}
            <div className="bill-picker">
              {shown.map((m) => (
                <label key={m.id} className="bill-picker__row">
                  <input type="checkbox" checked={picked.includes(m.id)} onChange={() => toggle(m.id)} />
                  <span>
                    {m.name}
                    <span className="bill-sub">{m.login}</span>
                  </span>
                </label>
              ))}
              {staff.length === 0 && <span className="bill-muted">{t("projects.noStaff")}</span>}
            </div>
            <div className="bill-picker__foot">
              <span className="bill-hint">{t("projects.selectedCount", { n: picked.length, total: staff.length })}</span>
              <span className="bill-actions">
                <button type="button" className="bibo-btn bibo-btn--ghost bibo-btn--sm" onClick={() => setPicked(staff.map((m) => m.id))}>
                  {t("projects.selectAll")}
                </button>
                <button type="button" className="bibo-btn bibo-btn--ghost bibo-btn--sm" onClick={() => setPicked([])}>
                  {t("projects.clearAll")}
                </button>
              </span>
            </div>
            {picked.length === 0 && <Notice kind="info">{t("projects.noneYet")}</Notice>}
          </>
        )}
      </div>

      {project && (
        <label className="bill-check">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          {t("projects.archiveLabel")}
        </label>
      )}
    </Dialog>
  );
}
