# macOS permissions

Modern macOS gates the APIs this app needs behind explicit, user-granted
permissions. Each is a one-time system prompt; the app must detect when a
permission is missing and guide the employee to grant it in **System Settings →
Privacy & Security**.

## Required permissions

| Permission | Needed for | Without it |
|---|---|---|
| **Accessibility** | Reading window titles; the `CGEventTap` keyboard listener | App names still work; window titles are null and keyboard counting fails. |
| **Input Monitoring** | Global keyboard event tap | Keyboard counting does not work. |
| **Screen Recording** | Capturing screenshots | Screenshots are blank/black or fail. |

> Active **app name** alone (via `NSWorkspace`) needs no special permission, which
> is why Phase 1 can ship before the onboarding screen exists.

## Permissions screen (dedicated UI — built in Phase 2)

A first-class screen, not a banner. It is shown automatically on launch whenever any
required permission is missing, and is always reachable from **Settings →
Permissions**. It styles per [07-ui-design.md](07-ui-design.md) (flat, tokens,
dark/light).

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  Permissions                                                   │
│  ctracking needs these macOS permissions to work.             │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ ●  Accessibility                          [ Granted ]     │ │  ← success token
│  │    Window titles & keyboard activity                      │ │
│  ├──────────────────────────────────────────────────────────┤ │
│  │ ▲  Input Monitoring               [ Open Settings → ]     │ │  ← danger/warn token
│  │    Counting keypresses (counts only, never the keys)      │ │
│  ├──────────────────────────────────────────────────────────┤ │
│  │ ▲  Screen Recording               [ Open Settings → ]     │ │
│  │    Periodic screenshots                                    │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  2 of 3 granted · Re-checks automatically        [ Re-check ] │
│  ⓘ Some permissions require quitting & reopening the app.      │
└──────────────────────────────────────────────────────────────┘
```

### Per-permission row

| Element | Behavior |
|---|---|
| **Status indicator** | Icon **+ text label** (not color alone): `Granted` (success token + ●) / `Not granted` (danger token + ▲). Accessibility: never hue-only. |
| **Name + one-line purpose** | Plain-language reason; reinforce privacy where relevant (e.g. "counts only, never the keys"). |
| **Action button** | If granted → no button (or subtle "Granted" pill). If missing → **`Open Settings →`** primary button that deep-links to the exact pane. |

### States

- **Granted** — success indicator, no action needed.
- **Not granted** — danger indicator + `Open Settings →` button.
- **Granted-but-needs-restart** — neutral/warn indicator + **`Quit & Reopen`**
  button (some grants, esp. the event tap, only take effect after relaunch).
- **Revoked mid-run** — if a permission is revoked while running, the relevant
  tracker pauses and this row flips back to *Not granted* (see
  [06-macos-compatibility.md](06-macos-compatibility.md)).

### Behavior

1. On launch, check each permission's status; if any missing, route to this screen.
2. **Live re-check:** poll status (~1–2s) and/or re-check on window focus, so the row
   updates the moment the user returns from System Settings — no manual refresh
   needed. A manual **`Re-check`** button is also provided.
3. `Open Settings →` opens the exact pane via the deep links below; we cannot grant
   programmatically — macOS requires the user to toggle it themselves.
4. When all three are granted, auto-advance to the dashboard (or show a clear
   "All set — Continue" button).
5. Surface the **restart** requirement explicitly when detected, with a one-click
   `Quit & Reopen`.

### Permission status check (Rust side)

- Accessibility: `AXIsProcessTrustedWithOptions` (without prompting on the poll).
- Input Monitoring: `IOHIDCheckAccess(kIOHIDRequestTypeListenEvent)`.
- Screen Recording: `CGPreflightScreenCaptureAccess` (and `CGRequestScreenCaptureAccess`
  for the initial prompt).
- Expose each as a Tauri command returning `granted | denied | needs_restart` so the
  UI renders rows from real state — never assume/cache a one-time grant.

## Deep-link URLs (for the "Open Settings" buttons)

```
Accessibility:
  x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility
Input Monitoring:
  x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent
Screen Recording:
  x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture
```

## Notes & gotchas

- During development the host process (e.g. the terminal or your IDE) may be the
  thing that actually holds the permission — granting to the *built app* is what
  matters for distribution.
- Permission changes can require a full app restart to take effect (especially the
  event tap).
- For distribution the app should be **code-signed and notarized**; unsigned apps
  make these prompts and Gatekeeper warnings worse.
- This is the #1 source of friction for tools like this — invest in clear onboarding.
- Permission **behavior changes across macOS versions** (e.g. Sequoia/Tahoe periodic
  re-consent for screen recording, shifting deep-link pane IDs). Treat permissions as
  revocable mid-run, not one-time. See [06-macos-compatibility.md](06-macos-compatibility.md).
