# 4 — QA: theming

- **Phase:** 1
- **Type:** QA (interactive)
- **Status:** Blocked
- **Blocked by:** 3
- **Blocks:** —

## Goal
Confirm dark/light/system theming looks right and reacts live.

## Interactive checklist
- [ ] Toggle Light → all surfaces/text use the light tokens; legible contrast.
- [ ] Toggle Dark → all surfaces/text use the dark tokens; legible contrast.
- [ ] Set System, then change macOS appearance (System Settings → Appearance) — the
      app follows **live**, no restart.
- [ ] Inspect a few components: colors come from tokens (no stray hex).
- [ ] Accent color appears only on primary action / active nav / focus ring.
- [ ] Component starter set (button/card/pill/segmented/nav) looks correct in both.

## Pass condition
All boxes checked. Any failure → reopen task 3.
