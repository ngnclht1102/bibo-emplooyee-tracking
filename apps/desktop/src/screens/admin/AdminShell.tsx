import { useEffect, useRef, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { call as invoke } from "../../api";
import { Segmented } from "../../ui";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { AdminDashboard, initials, type OwnerBusiness } from "./AdminDashboard";
import type { AdminUser } from "./AdminLogin";

type Screen = "Dashboard" | "Employees" | "Settings";

const svgp = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const GridIcon = () => (<svg {...svgp} aria-hidden><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></svg>);
const UsersIcon = () => (<svg {...svgp} aria-hidden><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><path d="M16 3.128a4 4 0 0 1 0 7.744" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" /></svg>);
const GearIcon = () => (<svg {...svgp} aria-hidden><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>);
const BackIcon = () => (<svg {...svgp} width="18" height="18" aria-hidden><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>);
const LogOutIcon = () => (<svg {...svgp} width="16" height="16" aria-hidden><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>);
const ChevronsUpDown = () => (<svg {...svgp} width="16" height="16" aria-hidden><path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" /></svg>);
const CheckIcon = () => (<svg {...svgp} width="16" height="16" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>);
const PlusIcon = () => (<svg {...svgp} width="16" height="16" aria-hidden><path d="M5 12h14" /><path d="M12 5v14" /></svg>);

const NAV: { key: Screen; Icon: () => ReactElement }[] = [
  { key: "Dashboard", Icon: GridIcon },
  { key: "Employees", Icon: UsersIcon },
  { key: "Settings", Icon: GearIcon },
];

// The admin chrome that mirrors the web-admin AppShell: a left icon rail + a topbar
// (title · workspace picker · language · theme · account), wrapping the team pages.
export function AdminShell({
  token,
  user,
  onSignOut,
  onBack,
  theme,
  onThemeChange,
}: {
  token: string;
  user: AdminUser;
  onSignOut: () => void;
  onBack?: () => void;
  theme: string;
  onThemeChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const [screen, setScreen] = useState<Screen>("Dashboard");
  const [businesses, setBusinesses] = useState<OwnerBusiness[]>([]);
  const [bizId, setBizId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [bizMenuOpen, setBizMenuOpen] = useState(false);
  const bizMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    invoke<OwnerBusiness[]>("admin_businesses", { token })
      .then((bs) => {
        setBusinesses(bs);
        if (bs.length) setBizId(bs[0].id);
      })
      .catch(() => {});
  }, [token]);

  // Close the account menu on any outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  // Close the workspace menu on any outside click.
  useEffect(() => {
    if (!bizMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (bizMenuRef.current && !bizMenuRef.current.contains(e.target as Node)) setBizMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [bizMenuOpen]);

  // "New team" → the web admin, where workspace creation lives.
  async function openNewTeam() {
    setBizMenuOpen(false);
    try {
      await openUrl(await invoke<string>("admin_url"));
    } catch {
      /* ignore */
    }
  }

  const selected = businesses.find((b) => b.id === bizId) ?? null;
  const label = (s: Screen) =>
    s === "Employees" ? t("screens:admin.employees") : t(`nav.${s}`);
  const acct = initials(user.display_name);

  return (
    <div className="bb-adshell">
      <aside className="bb-adshell__rail">
        <span className="bb-adshell__logo" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M4.5 12 h3.2 l1.8 -4.4 l2.4 8.8 l1.8 -4.4 h4.5" />
          </svg>
        </span>
        <nav className="bb-adshell__nav">
          {NAV.map(({ key, Icon }) => (
            <button
              key={key}
              type="button"
              className={`bb-adshell__navbtn ${screen === key ? "on" : ""}`}
              onClick={() => setScreen(key)}
              title={label(key)}
              aria-label={label(key)}
            >
              <Icon />
            </button>
          ))}
        </nav>
        <span className="bb-adshell__railacct" title={user.display_name}>
          {acct}
          <span className="bb-adminboard__dot bb-adminboard__dot--active" />
        </span>
      </aside>

      <div className="bb-adshell__main">
        <header className="bb-adshell__topbar">
          {onBack && (
            <button type="button" className="bb-adshell__back" onClick={onBack} aria-label={t("screens:admin.back")}>
              <BackIcon />
            </button>
          )}
          <div className="bb-adshell__ttl">{label(screen)}</div>
          <div className="bb-adshell__right">
            {selected && (
              <div className="bb-adshell__bizwrap" ref={bizMenuRef}>
                <button
                  type="button"
                  className="bb-adshell__biz"
                  onClick={() => setBizMenuOpen((o) => !o)}
                  aria-haspopup="menu"
                  aria-expanded={bizMenuOpen}
                >
                  <span className="bb-adshell__bizic">{initials(selected.name)}</span>
                  <span className="bb-adshell__bizname">{selected.name}</span>
                  <span className="bb-adshell__bizcaret"><ChevronsUpDown /></span>
                </button>
                {bizMenuOpen && (
                  <div className="bb-adshell__bizmenu" role="menu">
                    {businesses.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={b.id === bizId}
                        className={`bb-adshell__bizopt ${b.id === bizId ? "on" : ""}`}
                        onClick={() => {
                          setBizId(b.id);
                          setBizMenuOpen(false);
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
            )}
            <LanguageSwitcher compact />
            <Segmented
              options={["Light", "Dark", "System"]}
              value={theme}
              labels={{ Light: t("theme.light"), Dark: t("theme.dark"), System: t("theme.system") }}
              onChange={onThemeChange}
            />
            <div className="bb-adshell__acctwrap" ref={menuRef}>
              <button
                type="button"
                className="bb-adshell__acctbtn"
                onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={user.display_name}
              >
                <span className="bb-adshell__acct">
                  {acct}
                  <span className="bb-adminboard__dot bb-adminboard__dot--active" />
                </span>
              </button>
              {menuOpen && (
                <div className="bb-adshell__menu" role="menu">
                  <div className="bb-adshell__menuname">{user.display_name}</div>
                  <div className="bb-adshell__menusep" />
                  <button type="button" className="bb-adshell__signout" role="menuitem" onClick={onSignOut}>
                    <LogOutIcon />
                    {t("screens:admin.signOut")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="bb-adshell__content">
          {screen === "Dashboard" && bizId && selected ? (
            <AdminDashboard token={token} businessId={bizId} businessName={selected.name} />
          ) : screen === "Dashboard" ? (
            <div className="muted bb-adminboard__msg">{t("loading")}</div>
          ) : (
            <div className="card bb-adminboard__empty">{t("screens:admin.comingSoon")}</div>
          )}
        </div>
      </div>
    </div>
  );
}
