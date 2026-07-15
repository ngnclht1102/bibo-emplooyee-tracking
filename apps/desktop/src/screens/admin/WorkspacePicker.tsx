import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { call as invoke } from "../../api";
import { initials, type OwnerBusiness } from "./AdminDashboard";

const svgp = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const ChevronsUpDown = () => (<svg {...svgp} width="16" height="16" aria-hidden><path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" /></svg>);
const CheckIcon = () => (<svg {...svgp} width="16" height="16" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>);
const PlusIcon = () => (<svg {...svgp} width="16" height="16" aria-hidden><path d="M5 12h14" /><path d="M12 5v14" /></svg>);

// The workspace (business) picker shown in the app topbar on admin screens. Lets
// the owner switch which workspace the admin screens act on, and opens the web
// admin to create a new team (creation isn't native yet). Extracted from the
// former AdminShell topbar; reuses the same `bb-adshell__biz*` styles.
export function WorkspacePicker({
  businesses,
  bizId,
  onSelect,
}: {
  businesses: OwnerBusiness[];
  bizId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function openNewTeam() {
    setOpen(false);
    try {
      await openUrl(await invoke<string>("admin_url"));
    } catch {
      /* ignore */
    }
  }

  const selected = businesses.find((b) => b.id === bizId) ?? null;
  if (!selected) return null;

  return (
    <div className="bb-adshell__bizwrap" ref={ref}>
      <button
        type="button"
        className="bb-adshell__biz"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="bb-adshell__bizic">{initials(selected.name)}</span>
        <span className="bb-adshell__bizname">{selected.name}</span>
        <span className="bb-adshell__bizcaret"><ChevronsUpDown /></span>
      </button>
      {open && (
        <div className="bb-adshell__bizmenu" role="menu">
          {businesses.map((b) => (
            <button
              key={b.id}
              type="button"
              role="menuitemradio"
              aria-checked={b.id === bizId}
              className={`bb-adshell__bizopt ${b.id === bizId ? "on" : ""}`}
              onClick={() => {
                onSelect(b.id);
                setOpen(false);
              }}
            >
              <span className="bb-adshell__bizic">{initials(b.name)}</span>
              <span className="bb-adshell__bizoptname">{b.name}</span>
              {b.id === bizId && <span className="bb-adshell__bizck"><CheckIcon /></span>}
            </button>
          ))}
          <div className="bb-adshell__menusep" />
          <button
            type="button"
            role="menuitem"
            className="bb-adshell__bizopt bb-adshell__bizaction"
            onClick={openNewTeam}
          >
            <span className="bb-adshell__bizplus"><PlusIcon /></span>
            <span className="bb-adshell__bizoptname">{t("screens:admin.newTeam")}</span>
          </button>
        </div>
      )}
    </div>
  );
}
