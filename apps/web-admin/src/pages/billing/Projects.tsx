import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { billingApi, type Project } from "../../api/billing";
import { Empty, Notice, Spinner } from "../../components/ui";
import { useBusinesses } from "../../useBusinesses";
import { Dialog, DialogFoot, IconFolder, IconPlus, TextField, centsToInput, errText, fmtMoney, ic, parseMoney } from "./common";
import { BillingGate } from "./BillingGate";

/** The projects the team books time against. Time on a billable project can go on a
 *  member's invoice; a project rate overrides each person's own rate. Archiving hides
 *  a project from the desktop app. */
export function Projects() {
  return <BillingGate>{(biz) => <ProjectsInner biz={biz} />}</BillingGate>;
}

function ProjectsInner({ biz }: { biz: string }) {
  const { t } = useTranslation("billing");
  const { selected } = useBusinesses();
  const [projects, setProjects] = useState<Project[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editProject, setEditProject] = useState<Project | "new" | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([billingApi.projects(biz), billingApi.settings(biz)])
      .then(([p, s]) => {
        setProjects(p.projects);
        setCurrency(s.currency);
      })
      .catch((e) => setError(errText(e, t("common.loadError"))))
      .finally(() => setLoading(false));
  }, [biz, t]);
  useEffect(load, [load]);

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

      {error && <Notice kind="danger">{error}</Notice>}
      {loading && <Spinner label={t("common.loading")} />}

      {!loading && (projects.length === 0 ? (
        <Empty>{t("projects.empty")}</Empty>
      ) : (
        <div className="bibo-card bibo-card--default admin-tablecard">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("projects.col.name")}</th>
                <th>{t("projects.col.billing")}</th>
                <th className="r">{t("projects.col.rate")}</th>
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
                    {p.rate_cents != null ? <span className="num">{fmtMoney(p.rate_cents, currency)}{t("common.perHour")}</span> : <span className="bill-muted">{t("projects.memberRates")}</span>}
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
        <ProjectDialog biz={biz} project={editProject === "new" ? null : editProject} currency={currency}
          onClose={() => setEditProject(null)} onSaved={() => { setEditProject(null); load(); }} />
      )}
    </div>
  );
}

function ProjectDialog({
  biz, project, currency, onClose, onSaved,
}: {
  biz: string;
  project: Project | null;
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation("billing");
  const [name, setName] = useState(project?.name ?? "");
  const [billable, setBillable] = useState(project?.billable ?? true);
  const [rate, setRate] = useState(centsToInput(project?.rate_cents));
  const [archived, setArchived] = useState(project?.archived ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const cents = rate.trim() ? parseMoney(rate) : null;
    if (rate.trim() && cents == null) return setError(t("common.badMoney"));
    setBusy(true);
    setError(null);
    try {
      await billingApi.saveProject(biz, { id: project?.id, name, billable, rate_cents: cents, archived });
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
    <Dialog icon={IconFolder} title={project ? t("projects.editTitle") : t("projects.new")} onClose={onClose} onSubmit={save} error={error}
      foot={<DialogFoot onClose={onClose} busy={busy} label={t("common.save")} disabled={!name.trim()}
        extra={project && <button type="button" className="bibo-btn bibo-btn--ghost" onClick={remove}>{t("common.delete")}</button>} />}>
      <TextField label={t("projects.col.name")} value={name} onChange={setName} required autoFocus />
      <TextField label={t("projects.rateLabel", { currency })} value={rate} onChange={setRate} placeholder={t("projects.ratePlaceholder")}
        hint={t("projects.rateHint")} />
      <label className="bill-check">
        <input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} />
        {t("projects.billableLabel")}
      </label>
      {project && (
        <label className="bill-check">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          {t("projects.archiveLabel")}
        </label>
      )}
    </Dialog>
  );
}
