# 101 — App-wide signature background + translucent surfaces

- **Phase:** 7
- **Type:** Implementation
- **Status:** Done
- **Blocked by:** —
- **Blocks:** 102

## Goal
Replace the subtle 2-tone welcome tint with one **bold blue→violet→pink mesh
background** used **app-wide on both web and desktop**, and make the center
surfaces transparent/translucent so the background reads as a single unique surface.
See [docs/14-signup-and-onboarding.md](../14-signup-and-onboarding.md) §4 and the
override note in [docs/07-ui-design.md](../07-ui-design.md). Supersedes the
`--welcome-gradient` token from task 83.

## Scope
- **One background token** `--app-gradient` (light + dark variants) in both
  `apps/web-admin/src/theme/theme.css` and `apps/desktop/src/theme.css`. Layered
  radial gradients over a base color — bolder + more saturated than today:

  ```
  /* light: near-white base; dark: deep indigo-black base */
  --app-gradient:
    radial-gradient(at 0% 0%,    color-mix(in srgb, var(--accent) 35%, transparent), transparent 50%),
    radial-gradient(at 100% 0%,  color-mix(in srgb, #8b5cf6   30%, transparent), transparent 50%),
    radial-gradient(at 80% 100%, color-mix(in srgb, #ec4899   25%, transparent), transparent 50%);
  ```
  (Exact stops/positions tunable; goal = a bold, unique multi-color wash, legible in
  both themes. Add violet/pink as named tokens, not raw hex scattered around.)

- **Apply app-wide:** set the gradient on the app root/body in both apps so every
  page/screen sits on it — web shell (`.app`, all routes) and desktop shell
  (`.app`, all screens) plus auth/onboarding.

- **Transparent center:** the signup/onboarding card loses its solid fill
  (`background: transparent`). Elsewhere, convert opaque panels to a translucent
  **glass surface** token (e.g. `--surface: color-mix(in srgb, var(--bg) 65%, transparent)`,
  optional `backdrop-filter: blur(...)`) and repoint `.card`, `.sidebar`, `.header`,
  `.set-group`, `.auth-card`, popovers/modals to it. Inputs stay a touch more opaque
  for legibility.

- **Keep legibility:** text/border/focus tokens unchanged; verify contrast over the
  gradient in light **and** dark. Respect `prefers-reduced-motion` (no animated
  gradient) and keep it cheap (static CSS, no canvas).

- Remove/retire `--welcome-gradient` usages (AuthLayout `.welcome`, desktop
  `.login.welcome`, onboarding) in favor of the global background.

## Acceptance criteria
- [ ] Both apps render the bold blue→violet→pink background on every page/screen,
      light and dark.
- [ ] Signup/onboarding cards are transparent; other panels are translucent glass
      with hairline borders — background shows through, content stays readable.
- [ ] No opaque flat card backgrounds remain where the spec calls for glass.
- [ ] Contrast acceptable in both themes; no animation; tokens only (no scattered hex).
- [ ] web-admin build + desktop build/typecheck pass.

## Notes
- Pairs with the rail redesign (tasks 94/97/99): those cards assume the transparent/
  glass treatment from this task. Can be built before or after them; if after, drop
  any temporary solid card fills they introduced.
