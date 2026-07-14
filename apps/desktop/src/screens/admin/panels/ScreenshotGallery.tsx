import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { call as invoke } from "../../../api";
import { fmtBytes, hhmmss, type ScreenshotMetaRow } from "../reportTypes";

// The image endpoint needs the owner's bearer token, so a plain <img src> can't
// reach it — the Rust `admin_screenshot_data` command fetches the bytes and
// returns a base64 data: URL. Cached per uuid so re-opening the lightbox / the
// thumbnail behind it doesn't refetch.
const cache = new Map<string, string>();
async function loadImage(clientUuid: string): Promise<string> {
  const hit = cache.get(clientUuid);
  if (hit) return hit;
  const url = await invoke<string>("admin_screenshot_data", { clientUuid });
  cache.set(clientUuid, url);
  return url;
}

const placeholder = "linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #000))";

// One gallery card. Fetches its thumbnail lazily (only once scrolled into view)
// to bound memory — base64 data URLs for a full page of webp add up.
function Shot({ meta, onOpen }: { meta: ScreenshotMetaRow; onOpen: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let alive = true;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          loadImage(meta.client_uuid).then((u) => alive && setUrl(u)).catch(() => {});
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => {
      alive = false;
      io.disconnect();
    };
  }, [meta.client_uuid]);

  return (
    <div ref={ref} className={`bb-shot${url ? " bb-shot--clickable" : ""}`} onClick={url ? onOpen : undefined}>
      <div className="bb-shot__img" style={url ? { backgroundImage: `url("${url}")` } : { background: placeholder }} />
      <div className="bb-shot__veil" />
      <span className="bb-shot__time">{hhmmss(meta.ts)}</span>
    </div>
  );
}

const svgp = { viewBox: "0 0 24 24", width: 22, height: 22, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const IconX = (<svg {...svgp}><path d="M18 6 6 18M6 6l12 12" /></svg>);
const IconLeft = (<svg {...svgp}><path d="m15 18-6-6 6-6" /></svg>);
const IconRight = (<svg {...svgp}><path d="m9 18 6-6-6-6" /></svg>);

// Fullscreen lightbox (portal onto <body> so position:fixed centers in the
// viewport). Full-size image fetched via the same cached data-URL loader.
function Lightbox({
  shots, index, onIndex, onClose,
}: {
  shots: ScreenshotMetaRow[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const meta = shots[index];
  const [url, setUrl] = useState<string | null>(null);
  const hasPrev = index > 0;
  const hasNext = index < shots.length - 1;

  useEffect(() => {
    let alive = true;
    setUrl(null);
    loadImage(meta.client_uuid).then((u) => alive && setUrl(u)).catch(() => {});
    return () => { alive = false; };
  }, [meta.client_uuid]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && hasPrev) onIndex(index - 1);
      else if (e.key === "ArrowRight" && hasNext) onIndex(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, hasPrev, hasNext, onIndex, onClose]);

  return createPortal(
    <div className="bb-lightbox" onClick={onClose}>
      <button type="button" className="bb-lightbox__btn bb-lightbox__close" aria-label={t("screens:detail.screenshots.close")} onClick={onClose}>
        {IconX}
      </button>
      {hasPrev && (
        <button type="button" className="bb-lightbox__btn bb-lightbox__nav bb-lightbox__nav--prev" aria-label={t("screens:detail.screenshots.prev")}
          onClick={(e) => { e.stopPropagation(); onIndex(index - 1); }}>
          {IconLeft}
        </button>
      )}
      {hasNext && (
        <button type="button" className="bb-lightbox__btn bb-lightbox__nav bb-lightbox__nav--next" aria-label={t("screens:detail.screenshots.next")}
          onClick={(e) => { e.stopPropagation(); onIndex(index + 1); }}>
          {IconRight}
        </button>
      )}
      <figure className="bb-lightbox__body" onClick={(e) => e.stopPropagation()}>
        {url ? (
          <img className="bb-lightbox__img" src={url} alt={t("screens:detail.screenshots.alt")} />
        ) : (
          <div className="muted">{t("screens:detail.screenshots.loading")}</div>
        )}
        <figcaption className="bb-lightbox__caption num">
          {index + 1} / {shots.length} · {hhmmss(meta.ts)} · {meta.width}×{meta.height} ·{" "}
          {t("screens:detail.screenshots.display", { id: meta.display_id })} · {fmtBytes(meta.byte_size)}
        </figcaption>
      </figure>
    </div>,
    document.body,
  );
}

export function ScreenshotGallery({ shots }: { shots: ScreenshotMetaRow[] }) {
  const { t } = useTranslation();
  const [active, setActive] = useState<number | null>(null);

  if (shots.length === 0)
    return <div className="muted bb-adminboard__msg">{t("screens:detail.screenshots.empty")}</div>;

  return (
    <div className="card bb-empshots">
      <div className="bb-empact__title">{t("screens:detail.screenshots.title")}</div>
      <div className="bb-shots-grid">
        {shots.map((s, i) => (
          <Shot key={s.client_uuid} meta={s} onOpen={() => setActive(i)} />
        ))}
      </div>
      {active != null && (
        <Lightbox shots={shots} index={active} onIndex={setActive} onClose={() => setActive(null)} />
      )}
    </div>
  );
}
