import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { adminCreateMessage, adminDeleteMessage, adminFindUsers, adminGetMessage, adminUpdateMessage } from "../../api/endpoints";
import type { AdminUser, MessageAudience, MessageContent, MessageDef, MessageFieldDef, MessageFieldType, MessageKind } from "../../api/types";
import { Notice, Spinner } from "../../components/ui";
import { LOCALES } from "./messageUtils";

const KINDS: MessageKind[] = ["announcement", "survey", "promo"];
const FIELD_TYPES: MessageFieldType[] = ["radio", "checkbox", "select", "text", "textarea", "rating", "nps"];
const HAS_OPTIONS = (t: MessageFieldType) => t === "radio" || t === "checkbox" || t === "select";

const blank = (): MessageDef => ({
  id: "",
  kind: "announcement",
  active: false,
  start: null,
  end: null,
  audience: {},
  repeat_days: 0,
  anonymous: true,
  content: { en: { title: "", body: "" } },
  fields: [],
});

// RFC 3339 ⇄ <input type="datetime-local"> (the admin's local time).
function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

/** Drop empty locales/optional strings so the saved JSON stays clean. */
function tidy(m: MessageDef): MessageDef {
  const content: Record<string, MessageContent> = {};
  for (const [loc, c] of Object.entries(m.content)) {
    const empty = !c.title && !c.body && !c.image && !c.cta_label && !c.cta_url;
    if (loc === "en" || !empty) {
      content[loc] = Object.fromEntries(Object.entries(c).filter(([, v]) => v !== "")) as unknown as MessageContent;
    }
  }
  const audience: MessageAudience = Object.fromEntries(
    Object.entries(m.audience).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : !!v)),
  );
  return { ...m, content, audience, fields: m.kind === "survey" ? m.fields : [] };
}

export function MessageEditor() {
  const { t } = useTranslation("dashboard");
  const navigate = useNavigate();
  const { id: editId } = useParams();
  const isNew = !editId;
  const [m, setM] = useState<MessageDef | null>(isNew ? blank() : null);
  const [lang, setLang] = useState<string>("en");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editId) return;
    adminGetMessage(editId)
      .then((msg) => setM({ ...msg, fields: msg.fields ?? [] }))
      .catch((e) => setError(String(e.message ?? e)));
  }, [editId]);

  if (!m) return <div className="admin-wrap">{error ? <Notice kind="danger">{error}</Notice> : <Spinner />}</div>;

  const set = (patch: Partial<MessageDef>) => setM({ ...m, ...patch });
  // A survey with answers can be reworded/translated, not restructured (backend enforces).
  const locked = !isNew && (m.response_count ?? 0) > 0;
  const setAud = (patch: Partial<MessageAudience>) => set({ audience: { ...m.audience, ...patch } });
  const content = m.content[lang] ?? { title: "", body: "" };
  const setContent = (patch: Partial<MessageContent>) => set({ content: { ...m.content, [lang]: { ...content, ...patch } } });
  const fields = m.fields ?? [];
  const setField = (i: number, patch: Partial<MessageFieldDef>) =>
    set({ fields: fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const moveField = (i: number, d: -1 | 1) => {
    const next = [...fields];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    set({ fields: next });
  };

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body = tidy(m!);
      if (isNew) await adminCreateMessage(body);
      else await adminUpdateMessage(body);
      navigate(`/internal/messages/${body.id}`);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(t("internal.confirmDelete"))) return;
    try {
      await adminDeleteMessage(m!.id);
      navigate("/internal/messages");
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  }

  const toggle = (list: string[] | undefined, v: string) =>
    list?.includes(v) ? list.filter((x) => x !== v) : [...(list ?? []), v];
  const checks = (key: "roles" | "kinds" | "platforms" | "locales", values: string[], label: (v: string) => string) => (
    <div className="im-checks">
      {values.map((v) => (
        <label key={v} className="im-check">
          <input type="checkbox" checked={!!m.audience[key]?.includes(v)} onChange={() => setAud({ [key]: toggle(m.audience[key], v) })} />
          {label(v)}
        </label>
      ))}
    </div>
  );

  return (
    <div className="admin-wrap" style={{ paddingBottom: 32 }}>
      <div className="admin-pagehead">
        <div className="admin-pagehead__main">
          <h1 className="admin-h1">{isNew ? t("internal.form.newTitle") : t("internal.form.editTitle")}</h1>
          {!isNew && <p className="admin-sub">{m.id}</p>}
        </div>
        <div className="im-actions">
          <button type="button" className="bibo-btn bibo-btn--ghost" onClick={() => navigate(isNew ? "/internal/messages" : `/internal/messages/${m.id}`)}>
            {t("internal.cancel")}
          </button>
          <button type="button" className="bibo-btn bibo-btn--primary" disabled={busy} onClick={save}>
            {busy ? t("internal.saving") : t("internal.save")}
          </button>
        </div>
      </div>

      {error && <Notice kind="danger">{error}</Notice>}

      <div className="im-editor">
        <div className="im-editor__form">
          <Section title={t("internal.form.basics")}>
            <Row>
              <Input label={t("internal.form.id")} hint={isNew ? t("internal.form.idHint") : undefined}
                value={m.id} disabled={!isNew} onChange={(v) => set({ id: v.toLowerCase() })} />
              <label className="bibo-field">
                <span className="bibo-field__lbl">{t("internal.form.kind")}</span>
                <select className="im-select" value={m.kind} disabled={locked} onChange={(e) => set({ kind: e.target.value as MessageKind })}>
                  {KINDS.map((k) => <option key={k} value={k}>{t(`internal.kind.${k}`)}</option>)}
                </select>
              </label>
            </Row>
            <label className="im-check im-check--strong">
              <input type="checkbox" checked={m.active} onChange={(e) => set({ active: e.target.checked })} />
              {t("internal.form.active")}
            </label>
            <Row>
              <Input label={t("internal.form.start")} type="datetime-local" value={toLocalInput(m.start)} onChange={(v) => set({ start: fromLocalInput(v) })} />
              <Input label={t("internal.form.end")} type="datetime-local" value={toLocalInput(m.end)} onChange={(v) => set({ end: fromLocalInput(v) })} />
            </Row>
            <Row>
              <Input label={t("internal.form.repeat")} hint={t("internal.form.repeatHint")} type="number"
                value={String(m.repeat_days)} onChange={(v) => set({ repeat_days: Math.max(0, parseInt(v || "0", 10) || 0) })} />
              {m.kind === "survey" && (
                <label className="im-check" style={{ alignSelf: "center" }}>
                  <input type="checkbox" checked={m.anonymous !== false} onChange={(e) => set({ anonymous: e.target.checked })} />
                  {t("internal.form.anonymous")}
                </label>
              )}
            </Row>
          </Section>

          <Section title={t("internal.form.audience")} hint={t("internal.form.audienceHint")}>
            {m.kind === "promo" && <Notice kind="info">{t("internal.form.promoNote")}</Notice>}
            <div className="im-sublbl">{t("internal.form.users")}</div>
            <UserPicker ids={m.audience.users ?? []} onChange={(users) => setAud({ users })} />
            <div className="im-sublbl">{t("internal.form.roles")}</div>
            {checks("roles", ["owner", "employee"], (v) => t(`internal.role.${v}`))}
            <div className="im-sublbl">{t("internal.form.kinds")}</div>
            {checks("kinds", ["team", "family"], (v) => t(`internal.wkind.${v}`))}
            <div className="im-sublbl">{t("internal.form.platforms")}</div>
            {checks("platforms", ["macos", "windows"], (v) => (v === "macos" ? "macOS" : "Windows"))}
            <div className="im-sublbl">{t("internal.form.locales")}</div>
            {checks("locales", [...LOCALES], (v) => v.toUpperCase())}
            <Row>
              <Input label={t("internal.form.minVersion")} value={m.audience.min_version ?? ""} placeholder="1.5.0" onChange={(v) => setAud({ min_version: v })} />
              <Input label={t("internal.form.maxVersion")} value={m.audience.max_version ?? ""} onChange={(v) => setAud({ max_version: v })} />
            </Row>
          </Section>

          <Section title={t("internal.form.content")} hint={t("internal.form.contentHint")}>
            <div className="im-langs" role="tablist">
              {LOCALES.map((l) => (
                <button key={l} type="button" role="tab" aria-selected={lang === l}
                  className={`im-lang${lang === l ? " on" : ""}${m.content[l]?.title ? " filled" : ""}`} onClick={() => setLang(l)}>
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            <Input label={t("internal.form.titleField")} value={content.title} onChange={(v) => setContent({ title: v })} />
            <label className="bibo-field">
              <span className="bibo-field__lbl">{t("internal.form.body")}</span>
              <textarea className="im-textarea" rows={4} value={content.body} onChange={(e) => setContent({ body: e.target.value })} />
            </label>
            {m.kind !== "survey" && (
              <>
                <Input label={t("internal.form.image")} value={content.image ?? ""} placeholder="https://" onChange={(v) => setContent({ image: v })} />
                <Row>
                  <Input label={t("internal.form.ctaLabel")} value={content.cta_label ?? ""} onChange={(v) => setContent({ cta_label: v })} />
                  <Input label={t("internal.form.ctaUrl")} value={content.cta_url ?? ""} placeholder="https://" onChange={(v) => setContent({ cta_url: v })} />
                </Row>
              </>
            )}
          </Section>

          {m.kind === "survey" && (
            <Section title={t("internal.form.questions")} hint={t("internal.form.questionsHint", { lang: lang.toUpperCase() })}>
              {locked && <Notice kind="info">{t("internal.form.lockedNote", { count: m.response_count })}</Notice>}
              {fields.map((f, i) => (
                <div key={i} className="im-q">
                  <div className="im-q__head">
                    <span className="im-q__num">{i + 1}</span>
                    <div className="im-q__tools">
                      <button type="button" className="bibo-btn bibo-btn--ghost bibo-btn--sm" disabled={i === 0} onClick={() => moveField(i, -1)} aria-label={t("internal.form.up")}>↑</button>
                      <button type="button" className="bibo-btn bibo-btn--ghost bibo-btn--sm" disabled={i === fields.length - 1} onClick={() => moveField(i, 1)} aria-label={t("internal.form.down")}>↓</button>
                      {!locked && (
                        <button type="button" className="bibo-btn bibo-btn--ghost bibo-btn--sm" onClick={() => set({ fields: fields.filter((_, j) => j !== i) })}>{t("internal.form.remove")}</button>
                      )}
                    </div>
                  </div>
                  <Input label={t("internal.form.qlabel")} value={f.label[lang] ?? ""} onChange={(v) => setField(i, { label: { ...f.label, [lang]: v } })} />
                  <Row>
                    <Input label={t("internal.form.qid")} value={f.id} disabled={locked} onChange={(v) => setField(i, { id: v })} />
                    <label className="bibo-field">
                      <span className="bibo-field__lbl">{t("internal.form.qtype")}</span>
                      <select className="im-select" value={f.type} disabled={locked}
                        onChange={(e) => {
                          const type = e.target.value as MessageFieldType;
                          setField(i, { type, options: HAS_OPTIONS(type) ? f.options ?? [{ value: "", label: {} }] : undefined });
                        }}>
                        {FIELD_TYPES.map((ft) => <option key={ft} value={ft}>{t(`internal.ftype.${ft}`)}</option>)}
                      </select>
                    </label>
                  </Row>
                  <label className="im-check">
                    <input type="checkbox" checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} />
                    {t("internal.form.required")}
                  </label>
                  {HAS_OPTIONS(f.type) && (
                    <div className="im-opts">
                      <div className="im-sublbl">{t("internal.form.options")}</div>
                      {(f.options ?? []).map((o, k) => (
                        <div key={k} className="im-opt">
                          <input className="im-inp im-inp--sm" placeholder={t("internal.form.optValue")} value={o.value} disabled={locked}
                            onChange={(e) => setField(i, { options: f.options!.map((x, j) => (j === k ? { ...x, value: e.target.value } : x)) })} />
                          <input className="im-inp" placeholder={`${t("internal.form.optLabel")} (${lang.toUpperCase()})`} value={o.label[lang] ?? ""}
                            onChange={(e) => setField(i, { options: f.options!.map((x, j) => (j === k ? { ...x, label: { ...x.label, [lang]: e.target.value } } : x)) })} />
                          {!locked && (
                            <button type="button" className="bibo-btn bibo-btn--ghost bibo-btn--sm"
                              onClick={() => setField(i, { options: f.options!.filter((_, j) => j !== k) })}>×</button>
                          )}
                        </div>
                      ))}
                      {!locked && (
                        <button type="button" className="bibo-btn bibo-btn--secondary bibo-btn--sm"
                          onClick={() => setField(i, { options: [...(f.options ?? []), { value: "", label: {} }] })}>
                          {t("internal.form.addOption")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {!locked && (
                <button type="button" className="bibo-btn bibo-btn--secondary"
                  onClick={() => set({ fields: [...fields, { id: `q${fields.length + 1}`, type: "radio", required: false, label: {}, options: [{ value: "", label: {} }] }] })}>
                  {t("internal.form.addQuestion")}
                </button>
              )}
            </Section>
          )}

          {!isNew && (
            <div className="im-danger">
              <button type="button" className="bibo-btn bibo-btn--ghost im-delete" onClick={remove}>{t("internal.delete")}</button>
            </div>
          )}
        </div>

        <div className="im-editor__preview">
          <div className="im-sublbl">{t("internal.form.preview")} · {lang.toUpperCase()}</div>
          <Preview m={m} lang={lang} />
        </div>
      </div>
    </div>
  );
}

/** Approximates the desktop popup for the selected language (falls back to EN). */
function Preview({ m, lang }: { m: MessageDef; lang: string }) {
  const { t } = useTranslation("dashboard");
  const c = { ...m.content.en, ...Object.fromEntries(Object.entries(m.content[lang] ?? {}).filter(([, v]) => v)) } as MessageContent;
  const pick = (l: Record<string, string>) => l[lang] || l.en || "";
  return (
    <div className="im-preview">
      {c.image?.startsWith("https://") && m.kind !== "survey" && <img src={c.image} alt="" />}
      <div className="im-preview__title">{c.title || "…"}</div>
      {c.body && <div className="im-preview__body">{c.body}</div>}
      {m.kind === "survey" &&
        (m.fields ?? []).map((f, i) => (
          <div key={i} className="im-preview__q">
            {pick(f.label) || "…"}
            {f.required && <span className="im-req"> *</span>}
            {f.options && <div className="im-preview__opts">{f.options.map((o) => pick(o.label) || o.value).join(" · ")}</div>}
            {f.type === "nps" && <div className="im-preview__opts">0 · 1 · 2 · … · 10</div>}
            {f.type === "rating" && <div className="im-preview__opts">★★★★★</div>}
          </div>
        ))}
      <div className="im-preview__btns">
        <span className="im-preview__later">{t("internal.preview.later")}</span>
        <span className="im-preview__cta">
          {m.kind === "survey" ? t("internal.preview.submit") : c.cta_label || t("internal.preview.gotIt")}
        </span>
      </div>
    </div>
  );
}

/** Pick specific users (search by name, username or email). Empty = no user filter. */
function UserPicker({ ids, onChange }: { ids: string[]; onChange: (ids: string[]) => void }) {
  const { t } = useTranslation("dashboard");
  const [picked, setPicked] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AdminUser[]>([]);

  // Resolve saved ids to names once, when an existing message loads.
  useEffect(() => {
    if (ids.length > 0) adminFindUsers({ ids: ids.join(",") }).then((r) => setPicked(r.users)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const timer = setTimeout(() => adminFindUsers({ q: q.trim() }).then((r) => setResults(r.users)).catch(() => {}), 250);
    return () => clearTimeout(timer);
  }, [q]);

  const nameOf = (id: string) => {
    const u = picked.find((p) => p.id === id);
    return u ? [u.name, u.username || u.email].filter(Boolean).join(" · ") : id;
  };
  const options = results.filter((u) => !ids.includes(u.id));
  const add = (u: AdminUser) => {
    setPicked([...picked, u]);
    onChange([...ids, u.id]);
    setQ("");
  };
  const remove = (id: string) => {
    setPicked(picked.filter((u) => u.id !== id));
    onChange(ids.filter((x) => x !== id));
  };

  return (
    <div className="im-users">
      {ids.length > 0 && (
        <div className="im-chips">
          {ids.map((id) => (
            <span key={id} className="im-chip">
              {nameOf(id)}
              <button type="button" className="bibo-btn bibo-btn--ghost bibo-btn--sm" aria-label={t("internal.form.remove")} onClick={() => remove(id)}>×</button>
            </span>
          ))}
        </div>
      )}
      <input className="im-inp" value={q} placeholder={t("internal.form.usersPlaceholder")} onChange={(e) => setQ(e.target.value)} />
      {options.length > 0 && (
        <div className="im-results">
          {options.map((u) => (
            <button key={u.id} type="button" className="im-result" onClick={() => add(u)}>
              <strong>{u.name}</strong> <span className="admin-muted">{[u.username, u.email].filter(Boolean).join(" · ")}</span>
            </button>
          ))}
        </div>
      )}
      <span className="admin-muted im-hint">{t("internal.form.usersHint")}</span>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="bibo-card bibo-card--default admin-cardpad im-section">
      <div className="admin-paneltitle">{title}</div>
      {hint && <div className="admin-muted im-hint">{hint}</div>}
      {children}
    </div>
  );
}

const Row = ({ children }: { children: ReactNode }) => <div className="im-row2">{children}</div>;

function Input({
  label, value, onChange, hint, type = "text", disabled, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  type?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="bibo-field">
      <span className="bibo-field__lbl">{label}</span>
      <input className="im-inp" type={type} value={value} disabled={disabled} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="admin-muted im-hint">{hint}</span>}
    </label>
  );
}
