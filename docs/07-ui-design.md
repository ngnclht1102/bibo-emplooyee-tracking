# UI design

The dashboard is a **quiet, utilitarian tool**, not a marketing surface. Visual
goal: flat, simple, minimal color, comfortable in both **dark and light mode**.

> **Override (UX v2, [14-signup-and-onboarding.md](14-signup-and-onboarding.md) §4):**
> the product now uses a single **bold blue→violet→pink mesh background app-wide**
> (web + desktop), with **translucent "glass" surfaces** instead of opaque flat
> cards. This intentionally supersedes the "no gradients / flat surfaces" parts of
> the principles below. The rest — minimal accent use, data-over-chrome, tokens,
> status-by-shape-not-hue, dark/light parity — still holds. Components reference
> tokens only; legibility over the gradient must hold in both themes.

## Principles

1. **Flat.** No skeuomorphism, no drop shadows for decoration, no gradients. Depth
   comes from **hairline borders** and subtle background-tone shifts, not shadows.
2. **Minimal color.** A near-monochrome neutral palette (grays) carries 95% of the
   UI. **One** accent color, used sparingly for the primary action, the active
   nav item, and focus rings. Color is reserved for **meaning**, not decoration.
3. **Data over chrome.** Numbers and timelines are the content; borders, labels and
   padding stay understated so data reads first.
4. **Calm, not clinical.** Generous whitespace, consistent spacing scale, restrained
   type. Looks like a system utility, not a dashboard template.
5. **Status via shape + text, not color alone.** Accessibility: never encode meaning
   in hue only (e.g. permission ✅/⚠️ uses icon + label, not just green/red).

## Color tokens (semantic, theme-aware)

Define tokens as CSS variables; each theme supplies values. Components reference
**tokens only**, never raw hex.

| Token | Role | Light | Dark |
|---|---|---|---|
| `--bg` | App background | `#FFFFFF` | `#1A1A1A` |
| `--bg-subtle` | Cards / panels | `#F6F6F6` | `#242424` |
| `--bg-inset` | Wells / inputs | `#FFFFFF` | `#2E2E2E` |
| `--border` | Hairline borders | `#E3E3E3` | `#363636` |
| `--text` | Primary text | `#1A1A1A` | `#ECECEC` |
| `--text-muted` | Secondary text | `#6B6B6B` | `#9A9A9A` |
| `--accent` | Single accent | `#2D6CDF` | `#5B8DEF` |
| `--accent-weak` | Accent tint bg | `#EAF1FE` | `#1E2A40` |
| `--danger` | Errors / revoked perms | `#C0392B` | `#E06A5C` |
| `--success` | Granted / ok | `#2E7D55` | `#5FB58A` |

> Keep `--danger`/`--success` muted, not saturated — they appear rarely and should
> read as quiet status, not alerts. Always paired with an icon/label.

## Theme handling

- **Three modes:** `light`, `dark`, `system` (follow macOS). Default = `system`.
- Detect via `window.matchMedia('(prefers-color-scheme: dark)')` and react to
  changes live. Tauri also exposes the OS theme — keep them in sync.
- Apply by setting `data-theme="light|dark"` on `:root`; all tokens switch from one
  variable block. No per-component theme logic.
- Persist the user's choice in settings; `system` re-reads the OS each launch.

## Typography & spacing

- **Font:** system stack (`-apple-system`, SF Pro on macOS) — native, no web fonts.
- **Type scale:** ~4 sizes total (e.g. 12 / 13 / 16 / 22). Tabular figures for
  metrics so columns of numbers align.
- **Spacing scale:** 4px base — `4 / 8 / 12 / 16 / 24 / 32`. Use it consistently;
  no arbitrary margins.
- **Radius:** small and uniform (e.g. 6px). **Border width:** 1px hairlines.

## Components (kept minimal)

- **Nav:** simple left sidebar or top tab row; active item marked with accent + weight.
- **Cards:** `--bg-subtle` fill, 1px `--border`, no shadow.
- **Charts:** single-hue or neutral; the timeline uses tone/opacity to differentiate
  apps rather than a rainbow. Avoid heavy chart-library default styling.
- **Tables:** hairline row separators, muted headers, tabular numbers.
- **Buttons:** one primary (accent fill), the rest ghost/outline. No gradients.

## Implementation notes

- Plain CSS variables + a light utility layer is enough; a heavy UI kit would fight
  the flat/minimal goal. If a component lib is used, strip its default theming and
  drive it from these tokens.
- Centralize tokens in one stylesheet (`theme.css`); document any new token here.
- Respect `prefers-reduced-motion`; keep transitions short and few.
