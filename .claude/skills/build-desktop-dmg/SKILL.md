---
name: build-desktop-dmg
description: Build the employeetrack macOS desktop app (Tauri) as a signed Universal 2 (Intel + Apple Silicon) .app and .dmg. Handles the version bump across all three manifests, runs the universal release build, and verifies arch/version/signature plus that the production backend URL is baked in and no Keychain linkage remains. Use whenever the user wants to build/rebuild/release/ship the desktop app, cut a version, or produce a .dmg/.app installer.
---

# Build the employeetrack desktop app (universal signed DMG)

Produces a Universal 2 `.app` + `.dmg` for `apps/desktop` (Tauri v2), signed with the
Apple Development identity. The backend URL is baked at compile time (production), so
the artifact points at `https://employeetracking.namnguyen.pro` out of the box.

## Prerequisites (already set up on this Mac)

- Both Rust targets: `rustup target add aarch64-apple-darwin x86_64-apple-darwin`.
- Signing identity in `apps/desktop/src-tauri/tauri.conf.json` →
  `bundle.macOS.signingIdentity = "Apple Development: ngnclht@gmail.com (CGC2675CK3)"`.
- `pnpm` deps installed.

## 1. Bump the version (keep all THREE in sync)

Set the same version in:
- `apps/desktop/package.json` → `"version"`
- `apps/desktop/src-tauri/tauri.conf.json` → `"version"`
- `apps/desktop/src-tauri/Cargo.toml` → `[package] version`

The `.dmg` filename and `Info.plist` `CFBundleShortVersionString` follow
`tauri.conf.json`.

## 2. Build (universal release)

Long-running (both arches compile, lipo, bundle, sign) — run it in the **background**
and wait for the completion notification:

```bash
pnpm --filter @ctracking/desktop tauri:build:universal
# = tauri build --target universal-apple-darwin
```

Artifacts land in:
```
apps/desktop/src-tauri/target/universal-apple-darwin/release/bundle/
  macos/employeetrack.app
  dmg/employeetrack_<version>_universal.dmg
```

## 3. Verify

```bash
cd apps/desktop/src-tauri/target/universal-apple-darwin/release/bundle
APP=macos/employeetrack.app; BIN="$APP/Contents/MacOS/ctracking"
lipo -archs "$BIN"                                                   # → x86_64 arm64
/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$APP/Contents/Info.plist"
codesign --verify --deep --strict "$APP" && echo "signature valid"
strings "$BIN" | grep -c "employeetracking.namnguyen.pro"           # → 1 (prod URL baked)
strings "$BIN" | grep -c "localhost:8080"                           # → 0
otool -L "$BIN" | grep -c Security.framework                        # → 0 (no Keychain)
```

## Notes / gotchas

- **Binary name is `ctracking`** (Cargo package), product/app name is `employeetrack`
  (`productName`), bundle id `com.briannguyen.ctracking`.
- **Backend URL is compile-time** (`apps/desktop/src-tauri/src/settings/mod.rs` →
  `DEFAULT_BACKEND_URL`). It is NOT read from `settings.json`. For a local-dev build,
  launch with `CTRACKING_BACKEND_URL=http://localhost:8080` — don't change the constant
  just to test.
- **Session tokens** are stored in `~/Library/Application Support/com.briannguyen.ctracking/session.json`
  (mode 0600), not the Keychain — so no Keychain access prompt.
- **Signed, not notarized.** Opens cleanly on this machine; other Macs get a Gatekeeper
  warning (right-click → Open). For frictionless distribution, switch to a *Developer ID
  Application* cert + notarization (see `docs/10-release-signing-notarization.md`); the
  build config already supports it via env (`APPLE_SIGNING_IDENTITY`, `APPLE_ID`, …).
- A harmless `NeedsRestart` dead-code warning during compile is expected.
