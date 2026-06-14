# Dev code-signing (stable TCC permissions)

## The problem

macOS TCC keys each permission (Accessibility, Input Monitoring, Screen Recording)
to the app's **code-signing identity** (its Designated Requirement). Dev builds are
normally **ad-hoc signed (`-`)**, which produces a *different* identity on every
build — so macOS treats each rebuild as a new app and **forgets the granted
permissions**, forcing you to remove + re-grant every time.

## The fix

Sign **every** build (debug and release) with **one stable identity** and a **fixed
bundle id**. When both stay constant, TCC keeps the grant across rebuilds — grant the
three permissions once, then never again.

## Signing identity (chosen)

We use the existing **Apple Development** code-signing identity already in the login
keychain (a valid, stable identity tied to the Apple account — preferable to a
self-signed cert, which on this machine failed to produce a usable signing key).

```
Identity: Apple Development: ngnclht@gmail.com (CGC2675CK3)
Keychain: login
```

Verify it's present and usable:

```
security find-identity -v -p codesigning      # should list the Apple Development identity
```

> A self-signed *Code Signing* cert (Keychain Access → Certificate Assistant) is the
> fallback when no Apple Development identity exists — create it with Identity Type
> *Self Signed Root* and Certificate Type *Code Signing*, then it appears in the list
> above.

## Bundle id (must stay constant)

```
com.briannguyen.ctracking   # set in tauri.conf.json — never change it between builds
```

## Signing the build

Release/bundle builds are signed automatically; debug runs are signed via the helper.

- **Release builds:** `tauri.conf.json` sets `bundle.macOS.signingIdentity` to
  `Apple Development: ngnclht@gmail.com (CGC2675CK3)`, so `tauri build` signs the app.
- **Signed debug bundle:** `scripts/sign-macos.sh <path-to-.app>` re-signs a built
  app with the same identity (override via `CTRACKING_SIGN_IDENTITY`). The desktop
  package exposes it as `pnpm --filter @ctracking/desktop sign:dev`.

```
codesign --force --deep --options runtime \
  --sign "Apple Development: ngnclht@gmail.com (CGC2675CK3)" <path>/ctracking.app
```

> Note on `tauri dev`: hot-reload runs the unbundled `target/debug` binary, which
> cargo ad-hoc-signs — fine for UI work (no permissions needed). For
> **permission-stable** testing, build a signed bundle (`tauri build --debug` then
> `sign:dev`, or grant the launching terminal per the dev shortcut below).

## Notes

- `tccutil` can only **reset** permissions, never **add** them — you cannot
  script-grant. Keeping the identity stable is the only way to avoid re-granting.
- **Dev shortcut:** during heavy iteration you can instead grant the three
  permissions to the **terminal/IDE that launches `tauri dev`** (Terminal, iTerm,
  VS Code); the child process inherits the host's grant. Useful until the sign hook
  is wired up.
- The Apple Development identity is for **dev**. Distribution still needs a
  **Developer ID Application** cert + notarization (see
  [06-macos-compatibility.md](06-macos-compatibility.md)).
