import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { call as invoke } from "../api";
import { track } from "../analytics";
import { WHATS_NEW } from "../messages/whatsNew";
import { Segmented } from "../ui";

// What's new + Send feedback (ticket 160). The release notes are the same bundled
// list the one-time popup uses, so this page works offline and in personal mode;
// it just shows the whole history instead of the newest entry. Feedback posts to
// the public /v1/feedback endpoint, which accepts no-account users too.

const KINDS = ["bug", "idea", "question", "other"] as const;
const MAX_MESSAGE = 4000;
const PLATFORM = navigator.userAgent.includes("Windows") ? "windows" : "macos";

/** Newest version first, comparing numerically segment by segment. */
function sortedVersions(): string[] {
  const parts = (v: string) => v.split(/[.+-]/).map((n) => parseInt(n, 10) || 0);
  return Object.keys(WHATS_NEW).sort((a, b) => {
    const [pa, pb] = [parts(a), parts(b)];
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      if ((pb[i] ?? 0) !== (pa[i] ?? 0)) return (pb[i] ?? 0) - (pa[i] ?? 0);
    }
    return 0;
  });
}

export function WhatsNew({
  version,
  email,
  signedIn,
  onRepliesSeen,
}: {
  version: string;
  email: string;
  signedIn: boolean;
  onRepliesSeen: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? "en";
  const versions = useMemo(sortedVersions, []);

  return (
    <div className="bb-whatsnew">
      <div className="bb-adminboard__pagehead">
        <h1 className="bb-adminboard__title">{t("whatsNew.title")}</h1>
        <p className="bb-adminboard__who">{t("whatsNew.sub")}</p>
      </div>

      {signedIn && <MyFeedback onRepliesSeen={onRepliesSeen} />}

      {versions.length === 0 ? (
        <div className="muted bb-adminboard__msg">{t("whatsNew.empty")}</div>
      ) : (
        versions.map((v) => {
          const items = WHATS_NEW[v][locale] ?? WHATS_NEW[v].en ?? [];
          return (
            <div key={v} className="card bb-whatsnew__rel">
              <div className="bb-whatsnew__relhead">
                <span className="bb-whatsnew__ver">v{v}</span>
                {v === version && <span className="bb-whatsnew__now">{t("whatsNew.installed")}</span>}
              </div>
              <ul className="bb-whatsnew__items">
                {items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            </div>
          );
        })
      )}

      <FeedbackForm version={version} locale={locale} email={email} />
    </div>
  );
}

type MyRow = {
  id: number;
  kind: string;
  message: string;
  created_at: string;
  reply: string;
  replied_at: string;
  unread: boolean;
};

function fmtWhen(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** The user's own messages and the replies to them; read on open. */
function MyFeedback({ onRepliesSeen }: { onRepliesSeen: () => void }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? "en";
  const [rows, setRows] = useState<MyRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    invoke<{ feedback: MyRow[]; unread: number }>("feedback_mine")
      .then((r) => {
        if (!alive) return;
        const list = r.feedback ?? [];
        setRows(list);
        // They're looking at the replies now — clear the badge, here and server-side.
        if (list.some((f) => f.unread)) {
          invoke("feedback_seen").catch(() => {});
          onRepliesSeen();
        }
      })
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [onRepliesSeen]);

  if (!rows || rows.length === 0) return null;

  return (
    <div className="card bb-whatsnew__mine">
      <div className="bb-panel__title">{t("feedback.mine.title")}</div>
      <p className="bb-whatsnew__fbsub">{t("feedback.mine.sub")}</p>
      {rows.map((f) => (
        <div key={f.id} className={`bb-myfb ${f.unread ? "bb-myfb--new" : ""}`}>
          <div className="bb-myfb__head">
            <span className="bb-myfb__kind">{t(`feedback.kinds.${f.kind}`)}</span>
            <span className="bb-myfb__when">{fmtWhen(f.created_at, locale)}</span>
            {f.unread && <span className="bb-myfb__badge">{t("feedback.mine.new")}</span>}
          </div>
          <div className="bb-myfb__msg">{f.message}</div>
          {f.reply ? (
            <div className="bb-myfb__reply">
              <div className="bb-myfb__replyhead">
                {t("feedback.mine.from")} · {fmtWhen(f.replied_at, locale)}
              </div>
              <div className="bb-myfb__replytxt">{f.reply}</div>
            </div>
          ) : (
            <div className="bb-myfb__pending">{t("feedback.mine.pending")}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function FeedbackForm({ version, locale, email }: { version: string; locale: string; email: string }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<string>("idea");
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState(email);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const text = message.trim();
    if (!text) {
      setError(t("feedback.required"));
      return;
    }
    setSending(true);
    setError(null);
    try {
      await invoke("feedback_submit", {
        kind,
        message: text,
        email: contact.trim(),
        platform: PLATFORM,
        version,
        locale,
      });
      track("feedback_sent", { kind });
      setSent(true);
      setMessage("");
    } catch {
      setError(t("feedback.error"));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card bb-whatsnew__fb">
      <div className="bb-panel__title">{t("feedback.title")}</div>
      <p className="bb-whatsnew__fbsub">{t("feedback.sub")}</p>

      {sent ? (
        <div className="bb-whatsnew__thanks" role="status">
          <div className="bb-whatsnew__thankstxt">{t("feedback.thanks")}</div>
          <button type="button" className="bibo-btn bibo-btn--secondary" onClick={() => setSent(false)}>
            {t("feedback.again")}
          </button>
        </div>
      ) : (
        <>
          <div className="bb-whatsnew__fbfield">
            <div className="bb-whatsnew__fblbl">{t("feedback.kind")}</div>
            <Segmented
              options={[...KINDS]}
              value={kind}
              onChange={setKind}
              labels={Object.fromEntries(KINDS.map((k) => [k, t(`feedback.kinds.${k}`)]))}
            />
          </div>

          <div className="bb-whatsnew__fbfield">
            <div className="bb-whatsnew__fblbl">{t("feedback.message")}</div>
            <textarea
              className="bb-whatsnew__fbinput"
              rows={5}
              maxLength={MAX_MESSAGE}
              placeholder={t("feedback.placeholder")}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <div className="bb-whatsnew__fbfield">
            <div className="bb-whatsnew__fblbl">{t("feedback.contact")}</div>
            <input
              className="bb-whatsnew__fbinput"
              type="email"
              maxLength={200}
              placeholder={t("feedback.contactPlaceholder")}
              value={contact}
              onChange={(e) => setContact(e.target.value)}
            />
          </div>

          {error && <div className="auth-err" role="alert">{error}</div>}

          <div className="bb-whatsnew__fbfoot">
            <button type="button" className="bibo-btn bibo-btn--primary" disabled={sending} onClick={submit}>
              {sending ? t("feedback.sending") : t("feedback.send")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
