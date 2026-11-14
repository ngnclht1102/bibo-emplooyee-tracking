import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { listen } from "@tauri-apps/api/event";
import { call as invoke } from "../api";
import { track } from "../analytics";
import { whatsNewFor } from "./whatsNew";

// In-app messages (ticket 145): the bundled "What's new" after an update, plus
// announcements / surveys / promos from the backend. Checked on launch and every
// time the window comes to the front (incl. reopening from the tray), one popup at
// a time and at least MIN_GAP apart. Each message's own rules decide repeats: once,
// every N days, or "remind me later" = tomorrow. Seen/dismissed state is kept per
// signed-in user. Content is structured data rendered as plain text — never remote
// HTML.

type Field = {
  id: string;
  type: "text" | "textarea" | "radio" | "checkbox" | "select" | "rating" | "nps";
  required: boolean;
  label: string;
  options?: { value: string; label: string }[];
};
type Message = {
  id: string;
  kind: "announcement" | "survey" | "promo";
  repeat_days: number;
  title: string;
  body: string;
  image?: string;
  cta_label?: string;
  cta_url?: string;
  fields?: Field[];
};
type Shown = { kind: "whatsnew"; version: string; items: string[] } | { kind: "message"; msg: Message };

const DAY = 86_400_000;
const FETCH_EVERY = 30_000; // rapid app switching shouldn't hammer the backend
const MIN_GAP = 60 * 60_000; // at most one backend popup an hour (What's new exempt)
const STATE_KEY = "bibo.messages"; // + ":" + user, so a shared machine doesn't mix users
const SEEN_VERSION_KEY = "bibo.whatsNewSeen";
const PLATFORM = navigator.userAgent.includes("Windows") ? "windows" : "macos";

// Popup analytics: Aptabase (product analytics) + our backend, which powers the
// per-message stats in the web-admin super-admin area. Best effort, never blocks.
function report(id: string, kind: string, event: string, version: string, locale: string) {
  track(`message_${event}`, { id, kind });
  invoke("message_event", { id, event, platform: PLATFORM, version, locale }).catch(() => {});
}

// Per-message display state, remembered locally (anonymous survey answers can't
// be traced server-side). done = never show again; nextAt = not before.
type LocalState = { lastShownAt?: number; msgs: Record<string, { done?: boolean; nextAt?: number }> };

function readState(user: string): LocalState {
  try {
    return { msgs: {}, ...JSON.parse(localStorage.getItem(`${STATE_KEY}:${user}`) || "{}") };
  } catch {
    return { msgs: {} };
  }
}
function writeState(user: string, s: LocalState) {
  try {
    localStorage.setItem(`${STATE_KEY}:${user}`, JSON.stringify(s));
  } catch {
    /* storage unavailable — worst case a message shows again */
  }
}
function readSeenVersion(): string | null {
  try {
    return localStorage.getItem(SEEN_VERSION_KEY);
  } catch {
    return null;
  }
}
function writeSeenVersion(v: string) {
  try {
    localStorage.setItem(SEEN_VERSION_KEY, v);
  } catch {
    /* ignore */
  }
}

export function MessageCenter({ user, version }: { user: string | null; version: string }) {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? "en";
  const [shown, setShown] = useState<Shown | null>(null);
  const open = useRef(false); // a popup is on screen — never stack another
  const lastFetch = useRef(0);
  const busy = useRef(false);

  const check = useCallback(async () => {
    if (open.current || busy.current || !version) return;
    busy.current = true;
    try {
      // 1. "What's new" — first launch on a new version. A fresh install (nothing
      //    seen yet) just records the version: there's nothing "new" to them.
      const seen = readSeenVersion();
      if (seen !== version) {
        writeSeenVersion(version);
        const items = seen ? whatsNewFor(version, locale) : null;
        if (items) {
          open.current = true;
          setShown({ kind: "whatsnew", version, items });
          report(`whatsnew-${version}`, "whatsnew", "shown", version, locale);
          return;
        }
      }

      // 2. Backend messages — signed-in only; the next one still due.
      if (!user) return;
      const now = Date.now();
      const state = readState(user);
      if (state.lastShownAt && now - state.lastShownAt < MIN_GAP) return;
      if (now - lastFetch.current < FETCH_EVERY) return;
      lastFetch.current = now;
      const res = await invoke<{ messages: Message[] }>("messages_fetch", { platform: PLATFORM, version, locale });
      const next = (res.messages ?? []).find((m) => {
        const s = state.msgs[m.id];
        return !s?.done && !(s?.nextAt && now < s.nextAt);
      });
      if (!next) return;
      state.lastShownAt = now;
      writeState(user, state);
      open.current = true;
      setShown({ kind: "message", msg: next });
      report(next.id, next.kind, "shown", version, locale);
    } catch {
      /* offline / backend unavailable — try again on a later focus */
    } finally {
      busy.current = false;
    }
  }, [user, version, locale]);

  useEffect(() => {
    check();
    // Native "window came to the front" (tray/Dock reopen, app switch); the DOM
    // focus/visibility events below are a fallback that rarely fires in the webview.
    const unlisten = listen("app-focused", () => check());
    const onFocus = () => check();
    const onVisible = () => {
      if (!document.hidden) check();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      unlisten.then((f) => f());
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check]);

  const close = () => {
    open.current = false;
    setShown(null);
  };

  if (!shown) return null;
  if (shown.kind === "whatsnew") {
    return (
      <WhatsNewPopup
        version={shown.version}
        items={shown.items}
        onClose={() => {
          report(`whatsnew-${shown.version}`, "whatsnew", "dismissed", version, locale);
          close();
        }}
      />
    );
  }
  return (
    <MessagePopup
      msg={shown.msg}
      version={version}
      locale={locale}
      onClose={(outcome) => {
        const m = shown.msg;
        const state = readState(user!);
        const s = (state.msgs[m.id] = state.msgs[m.id] ?? {});
        if (outcome === "later") s.nextAt = Date.now() + DAY;
        else if (outcome === "submitted" || m.repeat_days <= 0) s.done = true;
        else s.nextAt = Date.now() + m.repeat_days * DAY;
        writeState(user!, state);
        report(m.id, m.kind, outcome, version, locale);
        close();
      }}
    />
  );
}

function Overlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const { t } = useTranslation();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="msg-overlay" role="dialog" aria-modal="true">
      <div className="msg-card">
        <button type="button" className="msg-x" aria-label={t("messages.close")} onClick={onClose}>
          ×
        </button>
        {children}
      </div>
    </div>
  );
}

function WhatsNewPopup({ version, items, onClose }: { version: string; items: string[]; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Overlay onClose={onClose}>
      <h2 className="msg-title">{t("messages.whatsNewTitle", { version })}</h2>
      <ul className="msg-list">
        {items.map((it) => (
          <li key={it}>{it}</li>
        ))}
      </ul>
      <div className="msg-actions">
        <button type="button" className="bibo-btn bibo-btn--primary" onClick={onClose}>
          {t("messages.gotIt")}
        </button>
      </div>
    </Overlay>
  );
}

type Outcome = "dismissed" | "later" | "cta" | "submitted";
type Answers = Record<string, string | string[] | number>;

function MessagePopup({
  msg, version, locale, onClose,
}: {
  msg: Message;
  version: string;
  locale: string;
  onClose: (o: Outcome) => void;
}) {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<Answers>({});
  const [sending, setSending] = useState(false);
  const [thanks, setThanks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fields = msg.kind === "survey" ? msg.fields ?? [] : [];
  const set = (id: string, v: string | string[] | number) => setAnswers((a) => ({ ...a, [id]: v }));

  const isEmpty = (v: Answers[string] | undefined) =>
    v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

  async function submit() {
    if (fields.some((f) => f.required && isEmpty(answers[f.id]))) {
      setError(t("messages.required"));
      return;
    }
    setSending(true);
    setError(null);
    try {
      const clean = Object.fromEntries(Object.entries(answers).filter(([, v]) => !isEmpty(v)));
      await invoke("message_respond", { id: msg.id, answers: clean, platform: PLATFORM, version, locale });
      setThanks(true);
    } catch {
      setError(t("messages.error"));
    } finally {
      setSending(false);
    }
  }

  if (thanks) {
    return (
      <Overlay onClose={() => onClose("submitted")}>
        <h2 className="msg-title">{t("messages.thanks")}</h2>
        <div className="msg-actions">
          <button type="button" className="bibo-btn bibo-btn--primary" onClick={() => onClose("submitted")}>
            {t("messages.close")}
          </button>
        </div>
      </Overlay>
    );
  }

  const safeUrl = (u?: string) => (u && u.startsWith("https://") ? u : undefined);
  const image = safeUrl(msg.image);
  const cta = safeUrl(msg.cta_url);

  return (
    <Overlay onClose={() => onClose("dismissed")}>
      {image && (
        <img className="msg-image" src={image} alt="" onError={(e) => (e.currentTarget.style.display = "none")} />
      )}
      <h2 className="msg-title">{msg.title}</h2>
      {msg.body && msg.body.split(/\n{2,}/).map((p, i) => <p key={i} className="msg-body">{p}</p>)}

      {fields.map((f) => (
        <div key={f.id} className="msg-field">
          <div className="msg-label">
            {f.label}
            {f.required && <span className="msg-req"> *</span>}
          </div>
          <FieldInput field={f} value={answers[f.id]} onChange={(v) => set(f.id, v)} />
        </div>
      ))}

      {error && <div className="msg-error" role="alert">{error}</div>}

      <div className="msg-actions">
        <button type="button" className="bibo-btn bibo-btn--ghost" onClick={() => onClose("later")}>
          {t("messages.later")}
        </button>
        {msg.kind === "survey" ? (
          <button type="button" className="bibo-btn bibo-btn--primary" disabled={sending} onClick={submit}>
            {sending ? t("messages.sending") : t("messages.submit")}
          </button>
        ) : cta && msg.cta_label ? (
          <button
            type="button"
            className="bibo-btn bibo-btn--primary"
            onClick={() => {
              openUrl(cta).catch(() => {});
              onClose("cta");
            }}
          >
            {msg.cta_label}
          </button>
        ) : (
          <button type="button" className="bibo-btn bibo-btn--primary" onClick={() => onClose("dismissed")}>
            {t("messages.gotIt")}
          </button>
        )}
      </div>
    </Overlay>
  );
}

function FieldInput({
  field: f, value, onChange,
}: {
  field: Field;
  value: Answers[string] | undefined;
  onChange: (v: string | string[] | number) => void;
}) {
  const { t } = useTranslation();
  switch (f.type) {
    case "text":
      return <input className="msg-input" type="text" maxLength={2000} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "textarea":
      return <textarea className="msg-input" rows={3} maxLength={2000} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "select":
      return (
        <select className="msg-input" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="" disabled>{t("messages.choose")}</option>
          {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    case "radio":
      return (
        <div className="msg-choices">
          {f.options?.map((o) => (
            <label key={o.value} className="msg-choice">
              <input type="radio" name={f.id} checked={value === o.value} onChange={() => onChange(o.value)} />
              {o.label}
            </label>
          ))}
        </div>
      );
    case "checkbox": {
      const list = (value as string[]) ?? [];
      return (
        <div className="msg-choices">
          {f.options?.map((o) => (
            <label key={o.value} className="msg-choice">
              <input
                type="checkbox"
                checked={list.includes(o.value)}
                onChange={(e) => onChange(e.target.checked ? [...list, o.value] : list.filter((x) => x !== o.value))}
              />
              {o.label}
            </label>
          ))}
        </div>
      );
    }
    case "rating":
    case "nps": {
      const [lo, hi] = f.type === "nps" ? [0, 10] : [1, 5];
      return (
        <div>
          <div className="msg-scale">
            {Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map((n) => (
              <button
                key={n}
                type="button"
                className={`msg-scale__opt${
                  (f.type === "rating" ? typeof value === "number" && n <= value : value === n) ? " is-on" : ""
                }`}
                aria-pressed={value === n}
                onClick={() => onChange(n)}
              >
                {f.type === "rating" ? "★" : n}
                {f.type === "rating" && <span className="msg-sr">{n}</span>}
              </button>
            ))}
          </div>
          {f.type === "nps" && (
            <div className="msg-scale__ends">
              <span>{t("messages.npsLow")}</span>
              <span>{t("messages.npsHigh")}</span>
            </div>
          )}
        </div>
      );
    }
  }
}
