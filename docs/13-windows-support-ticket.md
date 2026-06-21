# TICKET: Windows support for BiBoTracking desktop app

**Status:** In progress · **Opened:** 2026-06-19 · **Owner:** brian.nguyen
**Plan:** [docs/12-windows-support-plan.md](12-windows-support-plan.md)
**Detailed tickets:** [docs/tickets/](tickets/00-INDEX.md) Phase 6 (tasks 68–79; M1=68 · M2=69–70 · M3=71–73 · M4=74–76 · M5=77–78 · M6=79)
**Goal:** Ship a Windows 10/11 (x64) Tauri build with parity for the four signals
(active window, keystroke counts, screenshots, browser pages). macOS must keep working.

---

## Progress checklist

### Infra — build machine (plan §5)
- [x] Windows PC reachable over SSH (`ssh winbuild` → 192.168.2.23, Win10 Pro) — done 2026-06-19
- [ ] Reserve static/DHCP IP for the PC in the router
- [x] §5.2 toolchain installed over SSH — done 2026-06-19:
  - [x] winget available (v1.28)
  - [x] Rust (MSVC) 1.96.0 + `x86_64-pc-windows-msvc` target
  - [x] Visual Studio Build Tools 2026 (MSVC C++ x64 + Windows SDK 10.0.26100, `signtool` x64 OK)
  - [x] Node v24.14 + pnpm 11.8 (via corepack)
  - [x] Git 2.53
  - [x] WebView2 runtime present (149.x)
  - [ ] NSIS — let Tauri fetch on first build
- [x] Toolchain verified (all versions print)

### Code port (plan §2–§3)
- [x] **M1 — Compiles & runs on Windows (skeleton)** — done 2026-06-19 (task 68)
  - Platform split `platform/{mod,macos,windows}.rs`; deps cfg-gated (`core-foundation`→macOS,
    `windows 0.58`→Windows); token-gen on `getrandom`; idle via `GetLastInputInfo`.
  - `cargo check` clean on macOS **and** Windows; debug build launched: WebView2 UI + axum
    server + real random token (proves `getrandom`).
- [x] **M2 — Keyboard counting on Windows** — code done 2026-06-19 (task 69); **QA 70 pending**
  - `WH_KEYBOARD_LL` low-level hook on a dedicated message-loop thread in `platform/windows.rs`;
    counts `WM_KEYDOWN`/`WM_SYSKEYDOWN` only (never reads the key). Compiles on Windows.
  - Degradation (elevated/higher-integrity foreground windows) documented per §8.
- [x] **M3 — Setup/consent UX + Settings opt-outs** — code done 2026-06-19 (tasks 71, 72); **QA 73 pending**
  - Data-driven `permissions_status()` → `Vec<CapabilityRow>` built per-OS (macOS = 3 TCC rows;
    Windows = capture/consent rows). `Permissions.tsx` renders rows generically.
  - Settings opt-outs `capture_screenshots` / `count_keystrokes` (honored by trackers); Windows
    first-run `Consent.tsx`; capture gated on `consented`. Org-managed lock respected. Frontend typechecks.
- [~] **M4 — Windows build + signing + installer** (tasks 74–76)
  - [x] 74: release NSIS build over SSH → `employeetrack_1.0.1_x64-setup.exe` (4.1 MB, unsigned);
        `build-desktop-exe` skill written. Copied back to the Mac (`/tmp/win-installer.exe`).
  - [ ] 75: Authenticode signing — **decision needed** (Azure Trusted Signing / OV / EV; §7.2).
  - [ ] 76: QA installer + SmartScreen (interactive).
- [ ] **M5 — Marketing/docs + dual download + deploy** (tasks 77–78)
- [ ] **M6 — QA matrix & alpha** (task 79; Win10/11, std/admin, single/multi-monitor + mixed DPI, Defender/SmartScreen)

---

## Open decisions (plan §7)
1. Build infra: LAN PC over SSH *(chosen)* vs self-hosted CI runner.
2. Signing: Azure Trusted Signing vs OV vs EV — **TBD (blocks 75 → public download)**.
3. Min OS/arch: Win10 (1809+) & 11, x64 only for v1.
4. Installer: NSIS *(recommended)* vs MSI.
5. Versioning: shared mac+win (next 1.1.0) vs independent.
6. Consent model: first-run consent + Settings opt-outs *(implemented)*.

## Log
- 2026-06-19 — OpenSSH server enabled on PC; Mac authorized; `ssh winbuild` working (after fixing a subnet mismatch).
- 2026-06-19 — §5.2 toolchain installed/verified over SSH (Rust 1.96 MSVC, VS Build Tools 2026 + Win SDK 10.0.26100 + signtool, Node 24/pnpm 11.8, Git 2.53, WebView2 149).
- 2026-06-19 — M1 platform abstraction landed; `cargo check` clean on both OSes; debug build launched & verified on Windows.
- 2026-06-19 — Broke down M1–M6 into [docs/tickets/](tickets/00-INDEX.md) Phase 6 (68–79); moved `sprint/`→`docs/tickets/`.
- 2026-06-19 — M2 (keyboard `WH_KEYBOARD_LL`) + M3 (data-driven permissions, consent, opt-outs) implemented; compiles on Windows, frontend typechecks. Release NSIS build (task 74) running; `build-desktop-exe` skill written. Remaining: interactive QA (70, 73, 76, 78, 79), signing decision (75), deploy (77).
