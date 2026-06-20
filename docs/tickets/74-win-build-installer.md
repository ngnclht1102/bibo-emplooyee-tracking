# 74 — M4a: Windows build + NSIS installer (build-desktop-exe skill)

- **Phase:** 6
- **Type:** Implementation
- **Status:** Blocked
- **Blocked by:** 69, 72
- **Blocks:** 75, 77

> Plan: [docs/12-windows-support-plan.md](../12-windows-support-plan.md) §5.3, §3 workstream I.
> Mirrors the existing `build-desktop-dmg` skill for macOS.

## Goal
A repeatable, scripted Windows release build producing an **NSIS `.exe`** installer,
driven from the Mac over SSH (`ssh winbuild`) — captured as a `build-desktop-exe` skill.

## Scope
- **Build workflow** (the §5.3 steps, made reproducible):
  1. Sync the repo to the PC (tar+scp over SSH; exclude `node_modules`/`target`/`.git`;
     use `COPYFILE_DISABLE=1` so macOS doesn't inject `._*` files that break tauri-build).
  2. `pnpm install` at the repo root.
  3. `pnpm --filter @ctracking/desktop tauri build --target x86_64-pc-windows-msvc`
     → NSIS `.exe` under
     `apps/desktop/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`.
  4. `scp` the installer back to the Mac.
- **Version bump parity:** bump version across the three manifests (root/desktop
  `package.json`, `src-tauri/Cargo.toml`, `tauri.conf.json`) like `build-desktop-dmg` does —
  decide shared-with-macOS vs independent track (open decision §7.5).
- **tauri.conf.json**: confirm Windows bundle config (NSIS target, installer mode
  per-user vs per-machine, WebView2 install mode — prefer downloadBootstrapper or
  embedBootstrapper). Productname stays `employeetrack`.
- **Verify the artifact**: correct version, x64, the production backend URL baked in
  (same check as the DMG skill), launches from a clean install, WebView2 present/installed.
- Author the **`build-desktop-exe` skill** documenting the above end-to-end.

## Acceptance criteria
- [ ] One command/skill produces a versioned NSIS `.exe` on the Mac from a clean checkout.
- [ ] Installer installs + launches on a clean Win10 and Win11 (x64); app runs (tray,
      screenshots, active window, idle, keyboard).
- [ ] Baked-in backend URL = production; version strings match across manifests.
- [ ] WebView2 handled on a machine without it preinstalled.
- [ ] Build is unsigned here — signing is task 75 (don't block the build on it).

## Notes
Alternative to SSH (deferred): self-hosted GitHub Actions runner on the PC (§5.3).
