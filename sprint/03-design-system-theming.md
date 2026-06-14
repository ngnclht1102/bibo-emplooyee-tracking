# 3 — Design system & theming (tokens, dark/light/system)

- **Phase:** 1
- **Type:** Implementation
- **Status:** Blocked
- **Blocked by:** 1
- **Blocks:** 4, 9, 15, 21, 27, 30

## Goal
A single source of truth for visual style: semantic CSS tokens + dark/light/system
theme switching, per [docs/07-ui-design.md](../docs/07-ui-design.md).

## Scope
- `theme.css` defining all semantic tokens for **light** and **dark** (table in the
  design doc). Components reference tokens only — no raw hex.
- Theme applied via `data-theme="light|dark"` on `:root`.
- Theme mode `light | dark | system` (default `system`); detect OS via
  `matchMedia('(prefers-color-scheme: dark)')` and react to live changes; keep in
  sync with Tauri's OS theme.
- Base primitives: type scale, 4px spacing scale, 6px radius, hairline borders.
- A tiny component starter set: button (primary/ghost), card, status pill,
  segmented control, sidebar nav item.

## Acceptance criteria
- [ ] Switching mode flips every screen with no per-component logic.
- [ ] `system` follows the OS and updates live when macOS appearance changes.
- [ ] No hardcoded colors in components — tokens only.
- [ ] Primitives render correctly in both themes.
