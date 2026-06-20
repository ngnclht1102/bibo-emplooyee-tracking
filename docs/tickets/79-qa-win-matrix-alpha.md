# 79 — M6: Windows QA matrix & alpha

- **Phase:** 6
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 70, 73, 76, 78
- **Blocks:** —

> Plan: [docs/12-windows-support-plan.md](../12-windows-support-plan.md) §4 M6, §8 risks.
> Final gate before a Windows alpha — analogous to task 67 for Phase 5.

## Goal
Full cross-matrix validation of the Windows build before alpha, including the
workstreams not separately ticketed (C: screenshots multi-monitor/DPI; D: active window).

## Matrix
Run the core flows across: **Win10 (1809+)** and **Win11**; **standard** and **admin**
accounts; **single** and **multi-monitor** incl. **mixed DPI**; **Defender/SmartScreen** on.

## Interactive checklist
- [ ] **Active window** (workstream D): app names + titles are correct for native apps,
      UWP/Store apps, and browsers.
- [ ] **Idle**: going idle (no input) pauses time; locking the screen / sleep counts as idle.
- [ ] **Keyboard** (task 69): global counts accurate; private; survives elevated-window gap.
- [ ] **Screenshots** (workstream C): captured on single + multi-monitor; **mixed-DPI**
      monitors render correctly (no clipping/scaling artifacts); each shot ≤50 KB;
      images load in the gallery (`asset://` scope valid on Windows paths).
- [ ] **Tray + close-to-tray** (workstream F): closing hides to tray; tray menu works;
      `hide_dock`/taskbar behavior as designed.
- [ ] **Consent + opt-outs** (task 73): first-run consent; toggles honored.
- [ ] **Sync**: logged-in sync pushes rows to the backend; screenshots upload; offline-safe.
- [ ] **Browser extension**: pairs via port auto-discovery; visits ingested.
- [ ] **Installer/SmartScreen** (task 76): clean install on each OS; uninstall clean.
- [ ] **Stability**: multi-hour run — no leaks, no runaway CPU, no crashes.

## Pass condition
All boxes checked across the matrix. File issues for any gaps; alpha ships only when the
core four signals + sync + install are green on both Win10 and Win11.
