# 2 — QA: project scaffold

- **Phase:** 1
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 1
- **Blocks:** —

## Goal
Human-run check that the scaffold actually launches and is the right target.

## Interactive checklist
- [ ] Run `tauri dev` — a window opens with the placeholder page, no console errors.
- [ ] Hot reload works: edit the React page, see it update live.
- [ ] Build the release `.app` and double-click it — it launches.
- [ ] Right-click the `.app` → Get Info shows it runs on this Mac; confirm it would
      run on macOS 13 (deployment target set).
- [ ] `lipo -info` on the binary shows both `arm64` and `x86_64`.
- [ ] `codesign -dv --verbose=4` on the built app shows the Apple Development
      identity (a stable identity), **not** ad-hoc `Signature=adhoc`.
- [ ] **Rebuild twice** and confirm the signing identity is identical both times — so
      TCC will treat it as the same app (no permission re-grant churn later).

## Pass condition
All boxes checked. Any failure → reopen task 1.
