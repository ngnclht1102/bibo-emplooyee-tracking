import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { billingApi, type OwnerProject } from "../../work/billingApi";
import { errMsg } from "../../work/useTaskTimer";
import { Dlg, Field, IconFolder, IconPlus } from "../../work/ui";

// Billing admin, native (CTR-16): the owner's projects, the same data web-admin shows
// under Billing → Projects. Time on a billable project can go on a member's invoice
// (ticket 159); a project rate overrides each member's rate; archiving hides the
// project from the members' desktop task list.

const money = (cents: number | null) => (cents == null ? "" : String(cents / 100));
const parseMoney = (s: string): number | null => {
  const v = Number(s.trim().replace(/\s/g, "").replace(",", "."));
  return s.trim() === "" ? null : Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : null;
};

export function BillingProjects({ businessId, businessName }: { businessId: string; businessName: string }) {
  const { t } = useTranslation("tasks");
  const [projects, setProjects] = useState<OwnerProject[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<{ kind: "project"; item: OwnerProject | null } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([billingApi.projects(businessId), billingApi.settings(businessId)])
      .then(([p, s]) => {
        setProjects(p.projects);
        setCurrency(s.currency);
        setError(null);
      })
      .catch((e) => setError(errMsg(e, "")))
      .finally(() => setLoading(false));
  }, [businessId]);
  useEffect(load, [load]);

  const errText = error === null ? null : error || t("offline");

  return (
    <div className="bb-members">
      <div className="bb-members__head">
        <div>
          <h1 className="bb-adminboard__title">{t("admin.projects.title")}</h1>
          <p className="bb-adminboard__who">
            {businessName} · {t("admin.projects.summary", { projects: projects.filter((p) => !p.archived).length })}
          </p>
        </div>
        <div className="bb-members__actions">
          <button type="button" className="bibo-btn bibo-btn--primary bb-members__add" onClick={() => setDialog({ kind: "project", item: null })}>
            <IconPlus /> {t("admin.projects.newProject")}
          </button>
        </div>
      </div>

      {errText && <div className="auth-err" role="alert">{errText}</div>}

      <div className="card bb-adminboard__tablecard">
        <div className="bb-panel__head bb-task-head">
          <div className="bb-panel__title">{t("admin.projects.projectsCard")}</div>
        </div>
        {loading ? (
          <div className="muted bb-adminboard__msg">{t("loading")}</div>
        ) : projects.length === 0 ? (
          <div className="muted bb-adminboard__msg">{t("admin.projects.noProjects")}</div>
        ) : (
          <table className="bb-adminboard__table">
            <thead>
              <tr>
                <th>{t("admin.projects.col.name")}</th>
                <th className="r">{t("admin.projects.col.rate")}</th>
                <th>{t("admin.projects.col.status")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className="r num">{p.rate_cents == null ? "—" : `${money(p.rate_cents)} ${currency}`}</td>
                  <td>
                    <span className={p.archived ? "pill" : "pill pill-success"}>
                      {t(p.archived ? "admin.projects.archived" : "admin.projects.active")}
                    </span>
                  </td>
                  <td className="r">
                    <button type="button" className="bb-adminboard__view" onClick={() => setDialog({ kind: "project", item: p })}>
                      {t("edit")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {dialog?.kind === "project" && (
        <ProjectDialog businessId={businessId} project={dialog.item} currency={currency}
          onClose={() => setDialog(null)} onSaved={() => { setDialog(null); load(); }} />
      )}
    </div>
  );
}

function ProjectDialog({ businessId, project, currency, onClose, onSaved }: {
  businessId: string; project: OwnerProject | null; currency: string;
  onClose: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation("tasks");
  const [name, setName] = useState(project?.name ?? "");
  const [billable, setBillable] = useState(project?.billable ?? true);
  const [rate, setRate] = useState(money(project?.rate_cents ?? null));
  const [archived, setArchived] = useState(project?.archived ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) return setError(t("admin.projects.needName"));
    const cents = parseMoney(rate);
    if (rate.trim() !== "" && cents == null) return setError(t("admin.projects.badRate"));
    setBusy(true);
    try {
      await billingApi.saveProject(businessId, {
        id: project?.id, name, billable, rate_cents: cents, archived,
      });
      onSaved();
    } catch (e) {
      setError(errMsg(e, t("offline")));
      setBusy(false);
    }
  }

  return (
    <Dlg icon={<IconFolder />} title={project ? t("admin.projects.editProject") : t("admin.projects.newProject")}
      onClose={onClose} onSubmit={save} error={error} busy={busy} submitLabel={t("save")}>
      <Field label={t("admin.projects.col.name")}>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <Field label={t("admin.projects.rate", { currency })}>
        <input type="text" value={rate} onChange={(e) => setRate(e.target.value)} placeholder={t("admin.projects.ratePlaceholder")} />
      </Field>
      <label className="bb-task-check">
        <input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} />
        {t("admin.projects.billable")}
      </label>
      {project && (
        <label className="bb-task-check">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          {t("admin.projects.archived")}
        </label>
      )}
    </Dlg>
  );
}
