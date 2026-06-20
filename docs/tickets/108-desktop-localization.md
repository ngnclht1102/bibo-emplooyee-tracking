# 108 — Desktop app: externalize strings + translate (incl. native/Rust)

- **Phase:** 9
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** 106
- **Blocks:** 110

## Goal
Localize the Tauri desktop app — the React UI **and** the native strings the Rust
side renders (tray menu, notifications, OS dialogs, consent) — to all 7 locales.

## Scope
- **React UI strings** → catalogs (`common`, `auth`, `onboarding`, `settings`,
  `activity`). Surfaces:
  - `screens/Welcome.tsx`, `screens/Login.tsx`, `screens/Onboarding.tsx` (3 steps +
    permissions copy), `screens/Consent.tsx` (Windows), `screens/Settings.tsx`,
    `screens/Dashboard.tsx`, `screens/Activity.tsx`, `screens/Screenshots.tsx`,
    `screens/Browser.tsx`, `App.tsx` (sidebar nav, pills "Tracking/Paused/Idle",
    "Local · no account", "Set up again"), `ui.tsx`.
  - Persona/permission copy and the privacy explanations (high-trust strings — review
    carefully so meaning is exact in every language).
- **Locale plumbing:** persist `locale` in Tauri app settings (added in 106). On
  change, the React app re-renders; the Rust side reads the same setting.
- **Native (Rust) strings** — these are NOT in the React catalogs, so localize them in
  Rust keyed off the persisted `locale`:
  - Tray/menu items (e.g. "Open main UI", "Hide from Dock/taskbar", "Quit").
  - System notifications.
  - Native file/permission dialogs and any OS-facing labels.
  - Approach: a small Rust locale map (or load the same JSON catalogs at build/run
    time) — keep keys identical to the JS `common` namespace where they overlap.
- **Translate** all keys to `zh-Hans, ja, vi, id, fr, es` per 106 glossary + bar.

## Acceptance criteria
- [x] No hardcoded user-visible English in `apps/desktop/src` **React** code (grep
      clean; brand name only).
- [x] Rust-rendered strings localized: tray menu items (Open/Start/Stop/Quit) +
      state tooltip now translate via a Rust `tr(locale, key)` table reading
      `settings.locale`, re-applied on language change (`tray::relabel`). No native
      notifications/dialogs exist (the only dialog title — export folder — is React).
- [x] Permission `label`/`description` (from the Rust `permissions_status` command)
      now render from the React `permissions.caps.<key>` catalog (keyed by stable
      permission key), with the Rust strings as fallback.
- [x] Language switch in desktop Settings persists across restarts (webview
      localStorage) and updates the React UI live.
- [x] Privacy/permission/onboarding copy translated with exact meaning.
- [ ] Native review sign-off per language (see 110) — pending.
- [x] Desktop frontend builds (`vite build`) + typechecks; Rust `cargo check` passes.
      (Full Tauri macOS/Windows packaging not re-run this pass.)

### As built (React side)
Namespaces: `common, auth, onboarding, welcome, settings, permissions, screens, media`
(56 catalog files = 8 × 7). `Segmented` extended with optional localized `labels` so the
theme toggle localizes without breaking stored values. Status pills + tooltips, nav,
account footer, and the loading state localized in `App.tsx`.

### Native localization (as built)
- Added `settings.locale` (Rust `Settings`, default "en"); `set_settings` preserves it
  so unrelated settings writes don't reset it.
- New `set_locale` Tauri command persists the locale + calls `tray::relabel`.
- Desktop `LanguageSwitcher` mirrors the choice to `set_locale`; `App.tsx` syncs the
  detected language to native on startup so the tray matches a returning user's UI.
- `Segmented` extended with optional localized `labels`.

## Notes
- Windows-only consent flow (`screens/Consent.tsx`) must be localized too.
- Tray strings differ per OS ("Dock" macOS vs "taskbar" Windows) — keep both keys.
