# ctracking — UI mockups (React)

Runnable, static mockups of the ctracking app + browser-extension popup. Pure visual
design (mock data, no real tracking), using the semantic tokens from
[../docs/07-ui-design.md](../docs/07-ui-design.md). Flat, low-color, dark + light.

## Run

```bash
cd design
npm install
npm run dev
```

Open the printed localhost URL. Use the **sidebar** to switch screens and the
**Light / Dark / System** toggle in the header to preview both themes.

## What's here

| Screen | File | Notes |
|---|---|---|
| App shell (sidebar + header + theme toggle) | `src/App.tsx` | Token-driven theming, live System mode |
| Design tokens | `src/theme.css` | Single source of truth — all colors via CSS vars |
| Dashboard | `src/screens/Dashboard.tsx` | Stat cards, active-time timeline (idle hatched), app breakdown |
| Activity (keyboard) | `src/screens/Activity.tsx` | Counts-only chart + privacy caption |
| Screenshots | `src/screens/Screenshots.tsx` | Thumbnail gallery grouped by time |
| Browser | `src/screens/Browser.tsx` | Top sites + page-visit table |
| Permissions | `src/screens/Permissions.tsx` | Status rows (icon+text), Open Settings / Quit & Reopen |
| Settings | `src/screens/Settings.tsx` | Theme, intervals, idle, retention, privacy, export |
| Extension popup | `src/extension/Popup.tsx` | MV3 toolbar popup (~340px), connected/paused states |

## Notes

- All data is mocked inline; replace with Tauri command queries when wiring the real app.
- No hardcoded hex in components — colors come from `theme.css` tokens only.
- This folder is a **design artifact**, separate from the eventual Tauri app.
