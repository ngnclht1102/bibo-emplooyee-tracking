import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchImageObjectUrl } from "../../api/client";
import type { ScreenshotMeta } from "../../api/types";
import { fmtBytes, fmtTime } from "../../format";
import { Empty, Modal, Spinner } from "../ui";

// Loads one auth-gated screenshot into an object URL, revoking on unmount.
function Thumb({ meta, onClick }: { meta: ScreenshotMeta; onClick: () => void }) {
  const { t } = useTranslation("reports");
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    fetchImageObjectUrl(meta.client_uuid)
      .then((u) => {
        made = u;
        if (alive) setUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [meta.client_uuid]);

  return (
    <div className="shot">
      <button className="thumb-btn" onClick={onClick} disabled={!url}>
        <div className="thumb">
          {failed ? (
            <span>{t("screenshots.unavailable")}</span>
          ) : url ? (
            <img src={url} alt={t("screenshots.alt", { time: fmtTime(meta.ts) })} />
          ) : (
            <Spinner />
          )}
        </div>
      </button>
      <div className="cap num">
        {fmtTime(meta.ts)} · {fmtBytes(meta.byte_size)}
      </div>
    </div>
  );
}

// Full-size image in the lightbox is fetched fresh (its own auth blob).
function Lightbox({ meta, onClose }: { meta: ScreenshotMeta; onClose: () => void }) {
  const { t } = useTranslation("reports");
  const [url, setUrl] = useState<string | null>(null);
  const ref = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchImageObjectUrl(meta.client_uuid)
      .then((u) => {
        ref.current = u;
        if (alive) setUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (ref.current) URL.revokeObjectURL(ref.current);
    };
  }, [meta.client_uuid]);

  return (
    <Modal onClose={onClose} wide>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
        {url ? (
          <img
            className="lightbox-img"
            src={url}
            alt={t("screenshots.alt", { time: fmtTime(meta.ts) })}
          />
        ) : (
          <Spinner label={t("screenshots.loading")} />
        )}
        <div className="caption num">
          {fmtTime(meta.ts)} · {meta.width}×{meta.height} ·{" "}
          {t("screenshots.display", { id: meta.display_id })} · {fmtBytes(meta.byte_size)}
        </div>
      </div>
    </Modal>
  );
}

export function ScreenshotGallery({ shots }: { shots: ScreenshotMeta[] }) {
  const { t } = useTranslation("reports");
  const [active, setActive] = useState<ScreenshotMeta | null>(null);

  if (shots.length === 0) return <Empty>{t("screenshots.empty")}</Empty>;

  return (
    <>
      <div className="gallery">
        {shots.map((s) => (
          <Thumb key={s.client_uuid} meta={s} onClick={() => setActive(s)} />
        ))}
      </div>
      {active && <Lightbox meta={active} onClose={() => setActive(null)} />}
    </>
  );
}
