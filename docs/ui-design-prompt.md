# ClaudeDesign Prompt — ctracking

> Copy everything below into ClaudeDesign.

---

Design the UI for **ctracking**, a local-only macOS desktop app for employee
activity tracking (a quiet, offline Hubstaff). It runs as a native desktop app
(Tauri webview). No marketing pages — this is a utilitarian internal tool.

## Visual style (strict)

- **Flat and minimal.** No skeuomorphism, no decorative drop shadows, no gradients.
  Depth comes only from **1px hairline borders** and subtle background-tone shifts.
- **Near-monochrome.** A neutral gray palette carries ~95% of the UI. Use **one**
  accent color, only for the primary action, the active nav item, and focus rings.
  Color encodes **meaning**, never decoration.
- **Data over chrome.** Numbers, timelines, and tables are the content; keep borders,
  labels, and padding understated so data reads first.
- **Calm + roomy.** Generous whitespace, a consistent 4px spacing scale
  (4/8/12/16/24/32), small uniform 6px radii.
- **Native feel.** System font stack (SF Pro on macOS). Tabular figures for all
  metrics so number columns align. ~4 type sizes total (≈12 / 13 / 16 / 22).
- **Status by icon + text, never hue alone** (accessibility).

## Dark + light mode (both required)

Design **both themes** from one set of semantic tokens. Components reference tokens
only, never raw hex.

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

Keep `--danger`/`--success` muted, not saturated — quiet status, always paired with
an icon/label.

## App shell

- Left **sidebar nav** (or top tab row) with these items: **Dashboard**,
  **Screenshots**, **Browser**, **Activity**, **Settings**.
- Active item marked with the accent + heavier weight only.
- A small global header: app name, today's date, and a **Pause/Resume tracking**
  toggle. A subtle "tracking active" dot.

## Screens to design

### 1. Dashboard (default)
The day's activity at a glance.
- **Top summary row** — 3–4 stat cards: *Active time today*, *Top app*,
  *Keypresses today*, *Screenshots taken*. Flat cards, hairline border, no shadow.
- **Timeline** — a horizontal day timeline (e.g. 9:00–18:00) showing which app was
  active across the day. Differentiate apps by **tone/opacity of a single hue or
  neutrals**, NOT a rainbow. Idle gaps shown as empty/hatched, clearly labeled.
- **App breakdown** — a list/table of apps by active time (app name, time, % bar).
  The % bar is a thin neutral/single-hue bar. Tabular numbers.
- Note: time shown is **active time only** — idle/locked time is excluded.

### 2. Permissions screen
Shown on launch if any macOS permission is missing; also reachable from Settings.
A card with one row per permission: **Accessibility**, **Input Monitoring**,
**Screen Recording**.
- Each row: status indicator (icon **+ text**: `Granted` success / `Not granted`
  danger), the permission name, a one-line plain-language purpose (e.g. "Counting
  keypresses — counts only, never the keys"), and a right-aligned action.
- Missing → primary **`Open Settings →`** button. Granted → a subtle "Granted" pill,
  no button. A "needs restart" variant shows a **`Quit & Reopen`** button.
- Footer: "2 of 3 granted", a **`Re-check`** button, and a quiet note that some
  permissions need an app restart.

### 3. Screenshots
A **gallery grid** of periodic screenshots (thumbnails) grouped by time. Each
thumbnail shows its timestamp on hover. Click → larger preview. A date filter at top.
Keep it flat — thumbnails in a clean grid with hairline separators.

### 4. Browser activity
A **table** of visited pages: page title, domain/URL, time spent, timestamp. Sortable.
A small summary of top sites by time above the table (thin % bars, same style as the
app breakdown).

### 5. Activity (keyboard)
A simple **bar/area chart** of keypress counts over the day (counts per time bucket).
Single hue, flat. Caption clarifying privacy: "Counts only — actual keys are never
recorded." Optionally an idle-vs-active strip aligned to the same timeline.

### 6. Settings
Flat grouped sections (label on left, control on right):
- **Theme:** Light / Dark / System (segmented control; default System).
- **Capture intervals:** screenshot frequency, idle threshold (default 60s).
- **Permissions:** link to the Permissions screen.
- **Privacy:** toggle for store-domain-only vs full URL; deny-list.
- **Export:** buttons to export CSV / JSON.
- **Pause/Resume tracking.**

## Components to define (consistent across screens)

- Stat card, list-with-%-bar row, data table (hairline rows, muted header, tabular
  numbers), primary button (accent fill) + ghost/outline secondary, segmented
  control, status pill, sidebar nav item (default/active), empty state.

## Deliverables

- Both **light and dark** versions of: Dashboard, Permissions, Settings (at minimum).
- The shared component set above.
- Show the semantic tokens applied — no one-off colors.

Keep it quiet, flat, and legible. It should feel like a native macOS system utility,
not a SaaS dashboard template.
