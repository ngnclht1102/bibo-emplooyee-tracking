# Signup, personas & onboarding

Adds a **persona-aware signup + first-run onboarding** experience across the web
dashboard and the desktop app, so a new user goes cleanly from *first launch* →
*understanding the tool* → *granting permissions* → *(optionally) installing the
browser extension*. Builds on the existing auth stack
([11-backend-and-sync.md](11-backend-and-sync.md)); does not change the local-first
tracking model.

## Personas

Three audiences, picked in the signup wizard / desktop welcome:

| Persona | Account? | Under the hood | Onboarding tone |
|---|---|---|---|
| **Personal** ("Just me") | **No account, ever** — purely local | no backend rows; desktop runs in `local_only` mode | "Only you see this. Nothing leaves your computer." |
| **Manager / leader / freelancer-hunter** ("My team") | Free account | `account_type=manager`, owns a `kind=team` business; tracked people are `employee` memberships | "Your manager can review this for work hours." |
| **Parent** ("My family") | Free account | `account_type=parent`, owns a `kind=family` business; kids are `employee` memberships | "Your parent can see this to help with screen time." |

Parent≈owner and kid≈employee reuse the existing role machinery; `account_type` /
`kind` only drive **labels and copy** (e.g. "employees" vs "kids", "team" vs
"family"). No new role system.

> **Registration is web-only.** Accounts are created exclusively through the web
> signup wizard. The desktop app never has a register form — it only offers
> *sign in* and a *"Sign up on the web →"* link that opens the wizard in the
> browser. (Personal users create no account at all.) Adding members
> (employees/kids) is likewise a web-only owner/parent action.

## Welcome-surface exception to the flat rule

[07-ui-design.md](07-ui-design.md) mandates a flat, **gradient-free** utilitarian
dashboard. Signup/signin/onboarding are explicitly carved out as a **welcome
surface**: they may use the **logo lockup** and a **subtle light gradient**
(`--accent-weak` → `--bg`, top to bottom). Everything past onboarding — dashboards,
tables, timelines — stays flat per the original rule. This is the only sanctioned
exception.

## Data-model delta (backend)

- `users.account_type text NOT NULL DEFAULT 'manager' CHECK (account_type IN
  ('manager','parent'))`.
- `businesses.kind text NOT NULL DEFAULT 'team' CHECK (kind IN ('team','family'))`.
- `POST /v1/auth/register` accepts optional `account_type`; auto-created businesses
  (and `POST /v1/businesses`) set `kind` from it (`parent`→`family`, else `team`).
- `GET /v1/me` and `GET /v1/businesses/mine` echo `account_type` / `kind`.

Personal users never hit the backend — they have **no `users` row**. The desktop
app records the choice locally as a `local_only` setting.

## Desktop state machine (first launch)

```
launch ─▶ has session? ──yes──▶ onboarding_completed? ──yes──▶ dashboard
   │                                     │no
   │                                     ▼
   │                              Onboarding (D3–D5)
   ▼no
local_only set? ──yes──▶ (onboarding) ──▶ dashboard
   │no
   ▼
Welcome (D1: "Just me" | "I have an account" | "Sign up on web →")
   ├─ Just me ──▶ set local_only ──▶ Onboarding ──▶ dashboard
   └─ Sign in ──▶ Login (D2) ──▶ Onboarding ──▶ dashboard
```

## GIF strategy

Permission walkthroughs (macOS TCC toggles; Windows consent/capture) and the
Chrome-extension install are best shown as short GIFs. **v1 ships placeholder
slots** (`<img>` with a fixed aspect box + caption); real recordings land as a
later asset task. Static annotated PNGs are an acceptable interim per slot.

## Screens (ASCII reference)

The mockups for every screen below live in the implementation tickets and are
reproduced here as the source of truth.

### Web — sign-in (W1)
```
        ◆  BiBoTracking   (logo lockup, soft accent→bg gradient)
        ┌──────────────────────────────────────────┐
        │  Welcome back                            │
        │  Email   [ you@company.com            ]  │
        │  Password[ ••••••••••                 ]  │
        │            [  Sign in  ]                 │
        │  New here?  Create an account →          │
        └──────────────────────────────────────────┘
   Just tracking yourself?  Download the app — no account needed.
```

### Web — signup wizard step 1: persona (W2)
```
   ◆ BiBoTracking                         Step 1 of 3  ●──○──○
              How will you use BiBoTracking?
   ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
   │ 🧍 Just me      │ │ 👥 My team      │ │ 👨‍👩‍👧 My family   │
   │ Track myself,  │ │ Manage staff/  │ │ Watch my kids' │
   │ 100% local.    │ │ freelancers.   │ │ screen time.   │
   │ No account     │ │ Free account   │ │ Free account   │
   │ [ Use locally ]│ │ [ Continue → ] │ │ [ Continue → ] │
   └────────────────┘ └────────────────┘ └────────────────┘
   ⓘ "Just me" downloads the app and runs offline.
```
- **Personal →** W3 (download CTA, no account).
- **Team / Family →** W4 (account) → W5 (name team/family + gamified finish).

### Web — personal chosen (W3)
```
   🧍  Personal tracking is local-only — nothing to sign up for.
   [ Download for macOS ]   [ Download for Windows ]
   Already installed?  Open the app and pick "Just me".
```

### Web — create account (W4) & finish (W5)
```
   Step 2 of 3  ●──●──○            Step 3 of 3  ●──●──●
   Your name  [ Jane Cooper    ]   Name your [team]  [ Cooper Co. ]
   Email      [ jane@co.com    ]         [ Finish setup ]
   Password   [ •••••••• (≥8)  ]   ─── on success ───
        [ Create account → ]       ✦ You're all set! ✦
                                   ✓ Account  ✓ team  ○ Invite people
                                       [ Go to dashboard → ]
```
Labels switch team↔family by persona.

### Desktop — welcome / persona branch (D1) & login (D2)
```
        ◆ logo  —  Welcome, let's get you set up.
   ┌ 🧍 Just me (local) ┐   ┌ 👥/👨‍👩‍👧 I have an account ┐
   │ Offline, no account│   │ Sign in with creds      │
   │   [ Use locally → ]│   │      [ Sign in → ]      │
   └────────────────────┘   └─────────────────────────┘
        Need an account?  Sign up on the web →  (opens browser)
```

### Desktop — onboarding (D3 what it is · D4 what you can turn off · D5 permissions)
```
 ●──○──○  What it does          ●──●──○  What you can turn off
 • foreground app & time        Screenshots        [ ●— on ]
 • keypress COUNTS only         Keypress counting  [ ●— on ]
 • periodic screenshots         Browser tracking   [ —● off]   (🔒 if owner-managed)
 • web pages (extension)        Domain-only URLs   [ —● off]
 <persona line>                 ⓘ employee: locked rows are team-managed

 ●──●──●  Enable permissions (macOS shown; Windows variant swaps rows/gif)
 ┌ [ GIF placeholder ] ┐   Accessibility    ▲ Open
 │ toggle in Settings  │   Input Monitoring ▲ Open
 └─────────────────────┘   Screen Recording ✓ Done      [ Finish ✓ ]
```
Step 2 reuses the org-policy lock (`apply_org_policy`); Step 3 embeds the existing
`Permissions.tsx` rows + deep-links.

### Browser — extension install guide (B1)
```
   Install the BiBoTracking extension to track web pages.
   ┌ [ GIF placeholder ] ┐  1. Open Chrome
   │ install walkthrough │  2. Chrome Web Store → [ Get the extension → ]
   └─────────────────────┘  3. "Add to Chrome"   4. Come back — auto-connects
   Status: ▲ Waiting for the extension…  (auto-detect via /whoami)
   Supported: ✓ Chrome    Coming soon: Edge · Firefox · Safari
```
Shown until the extension pairs (existing `/whoami` discovery); then replaced by the
normal browser-activity table.

## Gamification (light, not noisy)

- `StepDots` progress indicator on every multi-step flow (`●──○──○`).
- A small **completion state** (`SuccessBurst`): checklist of what's done + one
  "what's next" item (e.g. *Invite people*), respecting `prefers-reduced-motion`.
- Persona cards use a single icon + one-line benefit, not marketing copy.

Stays within the token system; no new accent colors, no heavy animation.

---

# UX v2 — rail layout, add-members, persona wording (tasks 94–100)

A second pass refines the onboarding into a richer, guided experience and pushes
the persona vocabulary all the way into the dashboard.

## 1. Two-column layout with a progress rail

Both the **web signup wizard** and the **desktop onboarding** move from the single
centered card + `StepDots` to a **two-column** layout: content on the left (on the
welcome gradient), a **vertical progress rail** on the right (flat white panel).
The rail is a new shared `ProgressRail` component.

Each rail step shows a **status marker + title + one-line description**, connected
by a vertical line:

- **Done** — green filled circle with ✓, connector line tinted.
- **Current** — accent (blue) ringed circle with the step number, bold title.
- **Upcoming** — grey circle with the step number, muted title + description.

```
left (gradient)                              │  right rail (flat panel)
                                             │
  ◆ BiBoTracking                     │   ●✓  Choose account type
                                             │   │    Personal, team or family
  Create your account                        │   ●✓  Create your account
  Get the most out of BiBoTracking.  │   │    Name, email, password
                                             │   ④   Name your team
  ┌───────────────────────────────────────┐ │   │    What to call your team
  │ Your name  [ Jane Cooper           ]  │ │   ⑤   Add employees
  │ Email      [ jane@cooper.co         ] │ │   │    Invite the people you manage
  │ Password   [ ••••••••  (min 8)      ] │ │   ⑥   All set
  └───────────────────────────────────────┘ │        Start tracking
            [  Continue →  ]                  │
```

`ProgressRail` takes `steps: {title, description}[]` and `current` (1-based);
markers derive from `current`. Reused verbatim on desktop with its own step list.
On narrow widths the rail collapses to the existing horizontal `StepDots`.

## 2. Add-members step (web wizard only)

Adding people is an **owner/parent** action, so it lives in the **web** wizard, not
the employee/kid's desktop. A new step (before the finish screen) lets the owner add
one or more members inline — calling the existing `POST /v1/employees`
(`createEmployee`) per row — or **skip for now**. Labels switch employees↔kids by
persona.

```
left card (step "Add employees" / "Add kids")            right rail: step ⑤ current

  Add your employees                          (family → "Add your kids")
  Invite the people you manage. They'll sign in on the app with these details.

  Name             Email                Temp password
  [ Tom Lee     ]  [ tom@cooper.co   ]  [ ········ ]   [ + Add ]

  Added
   ✓ Tom Lee    tom@cooper.co                         [remove]
   ✓ Mia Lee    mia@cooper.co                         [remove]

       [ Skip for now ]                       [ Finish → ]
```

Each added member maps to a `users` row + `employee` membership in the owner's
business (the wizard already created it in the previous step). The finish screen's
checklist reflects how many were added.

## 3. Persona vocabulary in the dashboard

Past onboarding, the whole web admin speaks the persona's language. A `kind=family`
business renders **"Kids"** everywhere the app currently says "Employees" (and the
singular **"Kid"**); `kind=team` keeps **"Employees"**. One helper resolves it:

```
memberTerms(kind) → { one, many, addCta, ... }
  team   → { one: "Employee", many: "Employees", addCta: "Add employee" }
  family → { one: "Kid",      many: "Kids",      addCta: "Add kid" }
```

Driven by `business.kind` from `GET /v1/businesses/mine` (already returned by the
backend; the web `Business` type just needs the field). Surfaces updated: sidebar
nav, Employees page (title, add button, empty/loading states), Dashboard (table
header, empty states), EmployeeDetail (breadcrumb + title fallback), and Settings
copy ("…and all its kids", overrides, etc.).

## 4. App-wide signature background (bold mesh, transparent surfaces)

The subtle 2-tone welcome tint is replaced by a **bolder, multi-color mesh
background** — brand blue flowing into violet and a soft pink corner — that becomes
the **single signature surface across the whole product, web and desktop** (not just
onboarding). This is a deliberate override of the flat, gradient-free rule in
[07-ui-design.md](07-ui-design.md), recorded there too.

- **One background token** (`--app-gradient`, light + dark variants) set on the app
  root/body in both apps; layered radial gradients, e.g.:

  ```
  --app-gradient:
    radial-gradient(at 0% 0%,   <accent>/0.35, transparent 50%),
    radial-gradient(at 100% 0%, <violet>/0.30, transparent 50%),
    radial-gradient(at 80% 100%,<pink>/0.25,  transparent 50%);
  background-color: <base>;   /* light: near-white · dark: deep indigo-black */
  ```

- **Transparent center.** The signup/onboarding card loses its solid fill and goes
  **transparent** so the background reads as one continuous, unique surface. Across
  the apps, panels/cards/sidebar/header become **translucent "glass"** (a
  semi-opaque surface token + hairline border, optional subtle blur) rather than
  opaque `--bg-subtle`. Text, borders, focus rings keep their tokens; contrast must
  stay legible in light **and** dark.

- **Scope:** web admin (all pages + auth) and the desktop app (all screens +
  welcome/onboarding). Data density and flat components are unchanged — only the
  surface treatment shifts from opaque-flat to translucent-over-gradient.

## Task breakdown

See [tickets/00-INDEX.md](tickets/00-INDEX.md) **Phase 7** (tasks 80–92):
persona data model → register-by-persona → welcome-surface assets → web sign-in +
wizard → desktop welcome/login + onboarding → extension install guide → regression.

**UX v2 (tasks 94–100):** member-terms helper + `ProgressRail` foundation →
persona wording across the dashboard → web wizard rail redesign + add-members step →
desktop onboarding rail redesign.

**Signature background (tasks 101–102):** app-wide bold blue→violet→pink mesh +
translucent surfaces across web + desktop, replacing the 2-tone welcome tint.

See also [11-backend-and-sync.md](11-backend-and-sync.md) (auth/tenant model),
[03-macos-permissions.md](03-macos-permissions.md) and the Windows consent flow
([12-windows-support-plan.md](12-windows-support-plan.md)) for the permission steps
reused in onboarding, and [04-browser-extension.md](04-browser-extension.md) for the
extension pairing the install guide keys off.
