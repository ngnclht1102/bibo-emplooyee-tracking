import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { billingApi, type Client, type Project } from "../../api/billing";
import { Empty, Notice, Spinner } from "../../components/ui";
import { useBusinesses } from "../../useBusinesses";
import {
  Dialog, DialogFoot, IconBriefcase, IconFolder, IconPlus, SelectField, TextArea, TextField,
  centsToInput, errText, fmtMoney, ic, parseMoney,
} from "./common";
import { BillingGate } from "./BillingGate";

type Tab = "projects" | "clients";

/** Clients and the projects done for them. A project without a client is internal
 *  (never invoiced); a project rate overrides each person's own rate. */
export function Projects() {
  return <BillingGate>{(biz) => <ProjectsInner biz={biz} />}</BillingGate>;
}

function ProjectsInner({ biz }: { biz: string }) {
  const { t } = useTranslation("billing");
  const { selected } = useBusinesses();
  const [tab, setTab] = useState<Tab>("projects");
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editProject, setEditProject] = useState<Project | "new" | null>(null);
  const [editClient, setEditClient] = useState<Client | "new" | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([billingApi.projects(biz), billingApi.clients(biz), billingApi.settings(biz)])
      .then(([p, c, s]) => {
        setProjects(p.projects);
        setClients(c.clients);
        setCurrency(s.currency);
      })
      .catch((e) => setError(errText(e, t("common.loadError"))))
      .finally(() => setLoading(false));
  }, [biz, t]);
  useEffect(load, [load]);

  const projectCount = (id: string) => projects.filter((p) => p.client_id === id).length;

  return (
    <div className="admin-wrap" style={{ paddingBottom: 32 }}>
      <div className="admin-pagehead">
        <div className="admin-pagehead__main">
          <h1 className="admin-h1">{t("projects.title")}</h1>
          <p className="admin-sub">
            {selected?.name} · {t("projects.counts", { projects: projects.length, clients: clients.length })}
          </p>
        </div>
        <div className="admin-pagehead__actions">
          <button className="bibo-btn bibo-btn--secondary" onClick={() => setEditClient("new")}>
            {ic(IconPlus)}
            <span>{t("clients.new")}</span>
          </button>
          <button className="bibo-btn bibo-btn--primary" onClick={() => setEditProject("new")}>
            {ic(IconPlus)}
            <span>{t("projects.new")}</span>
          </button>
        </div>
      </div>

      <div className="bill-filters">
        <div className="bibo-tabs bibo-tabs--pill" role="tablist" style={{ marginLeft: 0 }}>
          {(["projects", "clients"] as Tab[]).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} className={`bibo-tab${tab === k ? " bibo-tab--on" : ""}`} onClick={() => setTab(k)}>
              {t(`projects.tab.${k}`)}
            </button>
          ))}
        </div>
      </div>

      {error && <Notice kind="danger">{error}</Notice>}
      {loading && <Spinner label={t("common.loading")} />}

      {!loading && tab === "projects" && (projects.length === 0 ? (
        <Empty>{t("projects.empty")}</Empty>
      ) : (
        <div className="bibo-card bibo-card--default admin-tablecard">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("projects.col.name")}</th>
                <th>{t("projects.col.client")}</th>
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
                  <td>{p.client_name || <span className="bill-muted">{t("projects.internal")}</span>}</td>
                  <td>
                    {p.billable && p.client_id ? (
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

      {!loading && tab === "clients" && (clients.length === 0 ? (
        <Empty>{t("clients.empty")}</Empty>
      ) : (
        <div className="bibo-card bibo-card--default admin-tablecard">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("clients.col.name")}</th>
                <th>{t("clients.col.email")}</th>
                <th className="r">{t("clients.col.projects")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.name}
                    {c.archived && <span className="bill-sub">{t("common.archived")}</span>}
                  </td>
                  <td className="admin-login">{c.email}</td>
                  <td className="r num">{projectCount(c.id)}</td>
                  <td className="r">
                    <button type="button" className="admin-viewlink" onClick={() => setEditClient(c)}>{t("common.edit")}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {editProject && (
        <ProjectDialog biz={biz} project={editProject === "new" ? null : editProject} clients={clients} currency={currency}
          onClose={() => setEditProject(null)} onSaved={() => { setEditProject(null); load(); }} />
      )}
      {editClient && (
        <ClientDialog biz={biz} client={editClient === "new" ? null : editClient}
          onClose={() => setEditClient(null)} onSaved={() => { setEditClient(null); load(); }} />
      )}
    </div>
  );
}

function ProjectDialog({
  biz, project, clients, currency, onClose, onSaved,
}: {
  biz: string;
  project: Project | null;
  clients: Client[];
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation("billing");
  const [name, setName] = useState(project?.name ?? "");
  const [clientId, setClientId] = useState(project?.client_id ?? clients.find((c) => !c.archived)?.id ?? "");
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
      await billingApi.saveProject(biz, { id: project?.id, name, client_id: clientId || null, billable, rate_cents: cents, archived });
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
      <SelectField label={t("projects.col.client")} value={clientId} onChange={setClientId}>
        <option value="">{t("projects.internalOption")}</option>
        {clients.filter((c) => !c.archived || c.id === project?.client_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </SelectField>
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

function ClientDialog({ biz, client, onClose, onSaved }: { biz: string; client: Client | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation("billing");
  const [name, setName] = useState(client?.name ?? "");
  const [email, setEmail] = useState(client?.email ?? "");
  const [address, setAddress] = useState(client?.address ?? "");
  const [archived, setArchived] = useState(client?.archived ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await billingApi.saveClient(biz, { id: client?.id, name, email, address, archived });
      onSaved();
    } catch (e) {
      setError(errText(e, t("common.saveError")));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!client || !window.confirm(t("clients.confirmDelete"))) return;
    try {
      await billingApi.deleteClient(biz, client.id);
      onSaved();
    } catch (e) {
      setError(errText(e, t("common.saveError")));
    }
  }

  return (
    <Dialog icon={IconBriefcase} title={client ? t("clients.editTitle") : t("clients.new")} onClose={onClose} onSubmit={save} error={error}
      foot={<DialogFoot onClose={onClose} busy={busy} label={t("common.save")} disabled={!name.trim()}
        extra={client && <button type="button" className="bibo-btn bibo-btn--ghost" onClick={remove}>{t("common.delete")}</button>} />}>
      <TextField label={t("clients.col.name")} value={name} onChange={setName} required autoFocus />
      <TextField label={t("clients.col.email")} type="email" value={email} onChange={setEmail} placeholder="billing@client.com" />
      <TextArea label={t("clients.address")} value={address} onChange={setAddress} rows={3} />
      {client && (
        <label className="bill-check">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          {t("clients.archiveLabel")}
        </label>
      )}
    </Dialog>
  );
}
