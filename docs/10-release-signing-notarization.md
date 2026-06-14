# Release: universal build, signing & notarization

## Universal (Apple Silicon + Intel) build

```bash
rustup target add x86_64-apple-darwin          # once (aarch64 is usually present)
pnpm --filter @ctracking/desktop tauri:build:universal
# = tauri build --target universal-apple-darwin
```

Output: a Universal 2 `employeetrack.app` (+ `.dmg`) under
`apps/desktop/src-tauri/target/universal-apple-darwin/release/bundle/`.
Verify both arches:

```bash
lipo -archs <app>/Contents/MacOS/ctracking   # → x86_64 arm64
```

## Signing

- **Dev / internal:** the existing **Apple Development** identity
  (`bundle.macOS.signingIdentity` in `tauri.conf.json`) is fine. The app opens on
  *your* machine and TCC permissions persist across rebuilds. On *other* Macs,
  Gatekeeper warns (right-click → Open to bypass).
- **Distribution:** must sign with a **Developer ID Application** cert, then notarize.

## Notarization

Lets the app open on any Mac with no Gatekeeper warning. Tauri does it during
`tauri build` when the prerequisites are present.

### Prerequisites
1. **Apple Developer Program** membership ($99/yr).
2. A **Developer ID Application** certificate in the login keychain
   (Xcode → Settings → Accounts → Manage Certificates → ＋ *Developer ID Application*,
   or developer.apple.com → Certificates). NOTE: *Apple Development* and
   *iPhone Distribution* certs **cannot** be notarized.
3. Hardened runtime — Tauri already signs with `--options runtime`. ✅

### Configure
Point signing at the Developer ID cert (either is fine):
- `tauri.conf.json` → `bundle.macOS.signingIdentity = "Developer ID Application: <Name> (<TEAMID>)"`, or
- env: `APPLE_SIGNING_IDENTITY="Developer ID Application: <Name> (<TEAMID>)"`

Provide notary credentials (pick one):

```bash
# Option A — Apple ID + app-specific password (appleid.apple.com → Sign-In & Security)
export APPLE_ID="you@example.com"
export APPLE_PASSWORD="abcd-efgh-ijkl-mnop"   # app-specific password
export APPLE_TEAM_ID="XXXXXXXXXX"

# Option B — App Store Connect API key (better for CI)
export APPLE_API_ISSUER="<issuer-uuid>"
export APPLE_API_KEY="<key-id>"
export APPLE_API_KEY_PATH="$HOME/keys/AuthKey_XXXX.p8"
```

### Build (signs → notarizes → staples)
```bash
pnpm --filter @ctracking/desktop tauri:build:universal
```
Tauri submits the bundle to Apple's notary service, waits, and **staples** the
ticket to the `.app` and `.dmg`. Verify:

```bash
xcrun stapler validate <app-or-dmg>
spctl -a -vvv -t install <app>     # → "accepted", source=Notarized Developer ID
```

### Manual fallback (without Tauri's built-in)
```bash
xcrun notarytool submit employeetrack_0.1.0_universal.dmg \
  --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_PASSWORD" --wait
xcrun stapler staple employeetrack.app
```

## Where we are now

- ✅ Universal build supported (`tauri:build:universal`).
- ✅ Signed with Apple Development (dev-stable; permissions persist).
- ⛔ **Not notarized** — needs a Developer ID Application cert (paid program). Until
  then, distribute to other Macs with the right-click → Open bypass, or notarize once
  the cert + creds are in place using the steps above.

See also [06-macos-compatibility.md](06-macos-compatibility.md) (deployment target,
Universal 2) and [08-dev-codesigning.md](08-dev-codesigning.md) (dev identity / TCC).
