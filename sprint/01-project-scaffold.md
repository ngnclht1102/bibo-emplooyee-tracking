# 1 — Project scaffold (Tauri v2 + React + TS)

- **Phase:** 1
- **Type:** Implementation
- **Status:** Ready
- **Blocked by:** —
- **Blocks:** 2, 3, 5, 13

## Goal
A running Tauri v2 desktop app with a React + Vite + TypeScript frontend, targeting
macOS 13+ (Universal 2).

## Scope
- Init Tauri v2 project with the React + TS + Vite template.
- Configure `tauri.conf.json`: app id, window title, `LSMinimumSystemVersion = 13.0`.
- Set Rust edition + a clean module layout (`trackers/`, `storage/`, `platform/`,
  `commands/`).
- Verify dev run (`tauri dev`) and a release build produce a launchable `.app`.
- Add basic README + scripts.
- **Stable dev code-signing** (per [docs/08-dev-codesigning.md](../docs/08-dev-codesigning.md)):
  fixed bundle id `com.briannguyen.ctracking`; sign release builds with the
  `Apple Development: ngnclht@gmail.com (CGC2675CK3)` identity via `tauri.conf.json`
  `bundle.macOS.signingIdentity`; provide `scripts/sign-macos.sh` to sign debug
  bundles with the same identity. This keeps TCC permissions across rebuilds — set it
  up now, before Phase 2's permission work.

## Acceptance criteria
- [ ] `tauri dev` opens a window showing a placeholder React page.
- [ ] Release build produces a `.app` that launches on macOS.
- [ ] Min deployment target is 13.0; build targets aarch64 + x86_64.
- [ ] Folder structure for trackers/storage/platform/commands exists (stubs ok).
- [ ] Bundle id is fixed (`com.briannguyen.ctracking`) and built apps are signed with
      the Apple Development identity (`codesign -dv` shows it, not ad-hoc `-`).
