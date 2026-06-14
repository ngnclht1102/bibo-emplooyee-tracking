# macOS version compatibility

The app must run across a range of macOS versions, with **macOS 26 (Tahoe)** as the
primary modern target. The risky areas are **screen capture APIs** and **TCC
permission behavior**, both of which Apple has changed repeatedly in recent releases.

## Support matrix

| macOS | Version | Status | Key concerns |
|---|---|---|---|
| Tahoe | 26 | **Primary target** | New permission re-consent cadence; ScreenCaptureKit required; "Liquid Glass" UI (UI only). |
| Sequoia | 15 | Supported | Introduced periodic screen-recording re-consent prompts; old capture APIs deprecated. |
| Sonoma | 14 | Supported | ScreenCaptureKit available; `CGDisplayCreateImage`/`CGWindowList*` deprecated. |
| Ventura | 13 | **Minimum floor** | System Settings layout differs; ScreenCaptureKit available — no legacy fallback needed. |

> **Decision (locked): minimum deployment target = macOS 13 (Ventura).** This keeps
> ScreenCaptureKit available on every supported version, so we never ship the legacy
> `CGDisplayCreateImage`/`CGWindowList*` fallback path. `LSMinimumSystemVersion = 13.0`.

## Screen capture — the biggest version risk

Apple deprecated the legacy capture path (`CGDisplayCreateImage`,
`CGWindowListCreateImage`) starting around macOS 14 and pushes **ScreenCaptureKit**
(`SCShareableContent` / `SCScreenshotManager`) as the supported API.

- `xcap` already prefers ScreenCaptureKit on modern macOS — good. Pin a version
  known to use SCK and **test capture explicitly on macOS 26**, since this is where
  the legacy path is most likely to break or warn.
- If we ever drop to a raw API, branch by version: ScreenCaptureKit on 14+, legacy
  only as a fallback below 14.

## TCC / permission behavior across versions

- **Sequoia (15)** added **recurring re-consent** prompts for screen recording
  (initially weekly/on-launch; softened in 15.1 after backlash). Expect macOS 26 to
  keep some periodic re-consent. The app must **handle permission being revoked
  mid-run** — detect failure, pause capture, re-prompt — not assume a one-time grant.
- **System Settings deep links** (the `x-apple.systempreferences:` URLs in
  [03-macos-permissions.md](03-macos-permissions.md)) have shifted pane identifiers
  across versions. Verify each link opens the right pane on 13 / 14 / 15 / 26; keep a
  per-version fallback that just opens Privacy & Security root.
- TCC prompt wording and the restart requirement after granting Accessibility /
  Input Monitoring vary slightly by version — don't hardcode assumptions; **detect
  state**, don't infer it.

## Architecture / CPU

- Ship a **Universal 2 binary** (Apple Silicon + Intel). macOS 26 is Apple-Silicon
  oriented but Intel Macs still run earlier supported versions.
- Build target: `aarch64-apple-darwin` + `x86_64-apple-darwin`, lipo'd into one
  app via Tauri's universal build.

## Distribution requirements

- **Code-sign + notarize** for every supported version. Gatekeeper on 15/26 is
  stricter; unsigned apps get harsher warnings and worse permission UX.
- Set `LSMinimumSystemVersion` in the bundle Info.plist to the chosen floor.
- Declare the capture/usage purpose strings the OS shows in prompts.

## Testing strategy

- **Version matrix in CI / manual passes:** at minimum macOS 26 (primary), 15, and
  the chosen floor (13). VMs or spare hardware per version.
- **Per-feature smoke test on each version:** active window, keyboard count,
  screenshot capture, permission detection, deep links.
- Treat **screenshot capture on macOS 26** and **mid-run permission revocation** as
  explicit, must-pass test cases — they are the most likely to regress.

## Abstraction guidance for the code

- Put all OS-version-sensitive logic behind a small Rust `platform` module
  (capture, permission status, settings deep links) so version branches live in one
  place rather than scattered through trackers.
- Never assume a permission stays granted; query status before each capture cycle
  and react to failures.
