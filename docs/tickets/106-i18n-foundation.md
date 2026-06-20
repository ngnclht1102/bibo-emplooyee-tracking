# 106 — i18n foundation & locale framework (web + desktop)

- **Phase:** 9
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** —
- **Blocks:** 107, 108, 109, 110

## Goal
Stand up the internationalization framework shared by the two React apps and define
the **translation quality bar** for the whole programme. After this ticket, any
string can be localized via a `t("key")` call and the user can switch language.

## Target locales
Ship 7 locales (English base + 6 high-population markets):

| Code      | Language            | Market note                         |
|-----------|---------------------|-------------------------------------|
| `en`      | English             | Base / source of truth              |
| `zh-Hans` | Chinese (Simplified)| Mainland China — largest market     |
| `ja`      | Japanese            | Japan                               |
| `vi`      | Vietnamese          | Vietnam (home market)               |
| `id`      | Indonesian (Bahasa) | Indonesia                           |
| `fr`      | French              | France + Francophone Africa/Canada  |
| `es`      | Spanish             | Spain + Latin America               |

(Chinese ships Simplified first; `zh-Hant` Traditional can be added later — keep the
key structure locale-agnostic so it slots in.)

## Scope
- **Library:** add `i18next` + `react-i18next` (+ `i18next-browser-languagedetector`
  for web) to both `apps/web-admin` and `apps/desktop`. Lightweight, SSR-free, fits
  Vite. JSON message catalogs per locale under `src/locales/<code>/<namespace>.json`.
- **Provider + init:** an `i18n.ts` per app that registers catalogs, sets fallback
  (`en`), and an `<I18nProvider>` at the app root.
- **Language switcher:** a shared-pattern `<LanguageSwitcher>` component
  (web: in `AppShell` + on the auth surface; desktop: in Settings + onboarding).
  Persist the choice — web: `localStorage`; desktop: a `locale` field in app settings
  (Tauri settings) so it survives restarts and is readable by the Rust side.
- **Detection order:** saved preference → OS/browser language → `en`.
- **Formatting:** numbers, dates, relative times, and durations go through `Intl`
  (`Intl.NumberFormat`, `Intl.RelativeTimeFormat`, `Intl.DateTimeFormat`) keyed off
  the active locale — replace the hand-rolled `format.ts` helpers to be locale-aware.
- **Key conventions:** namespaced dot keys (`auth.signIn.title`), ICU-style plurals
  via i18next (`{count, plural, ...}` → i18next `_one/_other` keys), and interpolation
  for variables. No string concatenation in components.
- **Brand & non-translatables:** `BiBoEmployeeTracking` stays verbatim in every
  locale. Persona wording (employee/kid, team/family) is already centralized in
  `terms.ts` — fold it into the catalogs so it localizes too.

## Translation quality bar (applies to 107–109)
- Native-fluent, **context-aware** translations — not raw machine output. Each locale
  reviewed by a fluent speaker before its ticket is marked Done.
- Keep a per-locale **glossary** (below) so recurring terms are consistent across all
  three surfaces. Tone: clear, friendly, professional (consumer SaaS).
- Respect locale norms: Japanese uses です/ます polite form; French/Spanish use vous/
  usted (formal); zh-Hans uses concise UI conventions; keep CJK punctuation native.
- Do not translate code, keys, URLs, or the brand name.

### Core glossary (EN → zh-Hans · ja · vi · id · fr · es)
| EN | zh-Hans | ja | vi | id | fr | es |
|----|---------|----|----|----|----|----|
| Sign in | 登录 | ログイン | Đăng nhập | Masuk | Se connecter | Iniciar sesión |
| Sign up | 注册 | 新規登録 | Đăng ký | Daftar | S'inscrire | Registrarse |
| Create your account | 创建账户 | アカウント作成 | Tạo tài khoản | Buat akun | Créer un compte | Crear cuenta |
| Sign out | 退出登录 | ログアウト | Đăng xuất | Keluar | Se déconnecter | Cerrar sesión |
| Email | 邮箱 | メールアドレス | Email | Email | E-mail | Correo electrónico |
| Username | 用户名 | ユーザー名 | Tên đăng nhập | Nama pengguna | Nom d'utilisateur | Nombre de usuario |
| Email or username | 邮箱或用户名 | メールまたはユーザー名 | Email hoặc tên đăng nhập | Email atau nama pengguna | E-mail ou nom d'utilisateur | Correo o nombre de usuario |
| Password | 密码 | パスワード | Mật khẩu | Kata sandi | Mot de passe | Contraseña |
| Employee | 员工 | 従業員 | Nhân viên | Karyawan | Employé | Empleado |
| Employees | 员工 | 従業員 | Nhân viên | Karyawan | Employés | Empleados |
| Kid | 孩子 | 子ども | Con | Anak | Enfant | Niño/a |
| Team | 团队 | チーム | Nhóm | Tim | Équipe | Equipo |
| Family | 家庭 | 家族 | Gia đình | Keluarga | Famille | Familia |
| Dashboard | 仪表板 | ダッシュボード | Bảng điều khiển | Dasbor | Tableau de bord | Panel |
| Activity | 活动 | アクティビティ | Hoạt động | Aktivitas | Activité | Actividad |
| Screenshots | 截图 | スクリーンショット | Ảnh chụp màn hình | Tangkapan layar | Captures d'écran | Capturas de pantalla |
| Time tracking | 时间跟踪 | 勤務時間の記録 | Theo dõi thời gian | Pelacakan waktu | Suivi du temps | Seguimiento del tiempo |
| Keypresses (count only) | 按键次数 | キー入力数 | Số lần gõ phím | Jumlah ketikan | Frappes au clavier | Pulsaciones de teclas |
| Settings | 设置 | 設定 | Cài đặt | Pengaturan | Paramètres | Ajustes |
| Permissions | 权限 | アクセス許可 | Quyền | Izin | Autorisations | Permisos |
| Tracking | 正在跟踪 | トラッキング中 | Đang theo dõi | Melacak | Suivi | Seguimiento |
| Paused | 已暂停 | 一時停止中 | Đã tạm dừng | Dijeda | En pause | En pausa |

## Acceptance criteria
- [x] `i18next`/`react-i18next` wired in both apps with `en` + 6 locale catalogs
      (`common` + `auth` namespaces seeded; full strings land in 107/108).
- [x] Language switcher present and persists across reloads/restarts (localStorage,
      key `locale`; switcher on the web auth surface + AppShell, and desktop Settings).
- [x] Detection falls back saved → OS/browser → `en` (`load: languageOnly`,
      `nonExplicitSupportedLngs`).
- [x] `Intl`-based date/relative-time formatting keyed to the active locale
      (`format.ts` now uses `i18n.t` + `Intl`). Duration h/m/s units deferred to 107.
- [x] Glossary + quality bar documented here and referenced by 107–109.
- [x] Both apps build (`vite build`) + typecheck (`tsc --noEmit`).

### Implementation notes (as built)
- Locale **codes use short forms** (`en, zh, ja, vi, id, fr, es`); `zh` = Simplified
  Chinese. This makes browser detection (`zh-CN`→`zh`, `fr-FR`→`fr`) reliable. The
  ticket's `zh-Hans` maps to `zh`; Traditional can be added later as `zh-Hant`.
- **Desktop persistence** uses the webview's `localStorage` (survives restarts), not a
  Rust-side settings field. The Rust-readable `settings.locale` + **native string
  localization** (tray/notifications/dialogs) is deferred to **108**, which is where
  the Rust side needs it.
- Proof surfaces localized now: web **SignIn** + nav/sign-out; desktop **Login** +
  nav + status pills + account footer. Remaining strings are 107 (web) / 108 (desktop).

## Notes
- Keep catalogs flat-ish per namespace (`common`, `auth`, `dashboard`, `settings`,
  `onboarding`) to limit merge churn when many strings move at once.
- Translation memory: store the EN source + all locales in the same key files so a
  reviewer can diff one file per language.
