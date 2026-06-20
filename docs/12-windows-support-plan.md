# Windows support — plan & build-machine setup

Status: **planned, not started.** macOS is the only shipping platform today.
This doc captures the port plan and how we'll build Windows installers on a LAN PC.

Brand: **BiBoEmployeeTracking** (display). Package ids stay `ctracking` / `@ctracking/*`
/ `com.briannguyen.ctracking` / Tauri productName `employeetrack` — unchanged on Windows.

---

## 1. Goal & scope

Ship a **Windows 10/11 (x64)** build of the Tauri desktop app with feature parity for the
four signals: active app/window time, keystroke counts, periodic screenshots, browser pages.
Backend, web-admin, sync, and the browser extension are already OS-agnostic — no functional
changes needed there. macOS builds must keep working unchanged.

Out of scope (v1): Linux, Windows on ARM, auto-update.

## 2. Core architectural change (everything depends on this)

`apps/desktop/src-tauri/src/platform/mod.rs` is currently **unconditionally macOS**
(CoreFoundation/CoreGraphics, no `cfg` gates), and `core-foundation` is an unconditional
dependency in `Cargo.toml`. **The repo will not compile for Windows until the platform layer
is abstracted.** First task:

- Define a stable internal API that trackers / commands / `lib.rs` call:
  - `active_window() -> Option<WindowInfo>`
  - `idle_seconds() -> u32`
  - `start_keyboard_counter(cb)` / stop
  - `capabilities() -> Vec<Capability>` (replaces the macOS-only `Permission` enum at call sites)
  - `open_settings(key)`, `request_capability(key)`
- Restructure:
  - `platform/mod.rs` — the interface + `pub use` of the active backend
  - `platform/macos.rs` — move all current code here, `#[cfg(target_os = "macos")]`
  - `platform/windows.rs` — new, `#[cfg(target_os = "windows")]`
- `Cargo.toml` — move `core-foundation` (+ CG deps) under
  `[target.'cfg(target_os = "macos")'.dependencies]`; add
  `[target.'cfg(target_os = "windows")'.dependencies] windows = { version = "0.58", features = [...] }`.
- **Make the permissions/setup screen data-driven:** `permissions_status()` returns a
  `Vec<{key,label,description,state,required}>` built per-OS; the React screen renders whatever
  it's given instead of hardcoding the three macOS rows. Supports macOS (3 TCC rows), Windows
  (consent/feature rows), and future Linux.

## 3. Workstreams

| ID | Area | macOS today | Windows plan | Risk |
|----|------|-------------|--------------|------|
| A | **Keyboard counting** | CGEventTap (`platform/mod.rs:180–286`) | `SetWindowsHookEx(WH_KEYBOARD_LL)` on a dedicated thread+message loop, count `WM_KEYDOWN`/`WM_SYSKEYDOWN` only (never decode keys). Fallback: Raw Input (`WM_INPUT`). Crate: `windows`. | **High** |
| B | **Idle detection** | `CGEventSourceSecondsSinceLastEventType` (`platform/mod.rs:319`) | `GetLastInputInfo()`. Drop-in behind `idle_seconds()`. | Low |
| C | **Screenshots** | `xcap` + webp (`trackers/mod.rs:269–309`) | `xcap` already supports Windows (DXGI/GDI) — calling code unchanged. Validate multi-monitor + mixed-DPI, ≤50 KB sizing, and `asset://` scope on Windows paths. | Medium |
| D | **Active window** | `active-win-pos-rs` (`platform/mod.rs:298`) | Already cross-platform — verify titles/app names on Windows. | Low |
| E | **Permissions / consent** | 3 TCC permissions (Accessibility / Input Monitoring / Screen Recording) | Windows has no per-feature OS prompts. Add a **first-run consent** + Settings **opt-out toggles** (disable screenshots / keyboard). Data-driven UI (see §2). | Low |
| F | **Tray / window** | Tauri tray + close-to-tray + Accessory dock policy (`lib.rs:24–30, 96–105`) | Tray + close-to-tray reuse as-is. `apply_dock_policy` is a no-op on Windows; map `hide_dock` → hide taskbar button (Win32 style) or defer. | Low |
| G | **Token gen** | `gen_token()` reads `/dev/urandom` (`server/mod.rs:68`) | Replace with `rand`/`getrandom` CSPRNG (cross-platform). | Low |
| H | **File perms** | `chmod 0o600` on session.json, `#[cfg(unix)]` (`sync/auth.rs:95`) | Already gated — no-op on Windows; optionally tighten NTFS ACL later. | Low |
| I | **Build / sign / dist** | universal-apple-darwin `.dmg`, codesign | **NSIS `.exe`** (or MSI), Authenticode signing. Must build **on Windows** (see §5). | Medium |

Already cross-platform (no work): `axum`/`tokio` local server, `rusqlite` storage, sync
client/worker, CSV export, settings paths (`app_data_dir`), the browser extension.

## 4. Milestones

1. **M1 — Compiles & runs on Windows (skeleton).** Platform abstraction + cfg-gating +
   `windows.rs` stubs + token-gen fix + data-driven permissions. Launches; tray, screenshots,
   active window, idle work; keyboard stubbed. *Unblocks everything.*
2. **M2 — Keyboard counting on Windows.** WH_KEYBOARD_LL hook wired into trackers. *(Highest risk.)*
3. **M3 — Setup/consent UX + Settings opt-outs + wording** (frontend; `Permissions.tsx`,
   `Activity.tsx`, `Screenshots.tsx`, `Settings.tsx`).
4. **M4 — Windows build + signing + installer** (build machine in §5; NSIS; Authenticode).
5. **M5 — Marketing/docs + dual download + deploy** (Download-for-Windows button, JSON-LD
   `operatingSystem`, keywords; stage `.exe` in `deploy/build.sh`).
6. **M6 — QA matrix & alpha** (Win10/Win11, standard vs admin, single/multi-monitor + mixed
   DPI, Defender/SmartScreen, extension pairing).

## 5. Build machine (LAN Windows PC, driven over SSH)

Tauri Windows installers **must** be built on Windows (MSVC + WebView2 + NSIS + `signtool`) —
we cannot cross-build from the Mac. We use a **LAN Windows 10 PC** (Intel i5-9400F, x64),
driven over SSH the same way `deploy-employeetracking` drives the VPS. The PC only needs to be
**on during a release build** (~10–20 min); keep it awake while building.

### 5.1 One-time: enable OpenSSH server + authorize the build Mac

Run once in an **elevated PowerShell** on the Windows PC (enables sshd, opens the firewall on
the private network, sets PowerShell as the SSH shell, and authorizes the build Mac's key):

```powershell
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Set-Service -Name sshd -StartupType Automatic; Start-Service sshd
if (-not (Get-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -DisplayName 'OpenSSH Server (sshd)' `
    -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 -Profile Private,Domain
}
New-ItemProperty -Path "HKLM:\SOFTWARE\OpenSSH" -Name DefaultShell `
  -Value "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -PropertyType String -Force | Out-Null
# Build Mac (ngnclht@gmail.com) public key — paste current key here if it rotates:
$key = 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQCeXxHUgWD+JP/tqNTQB/pPf+0MAl7/hwJY+J2I5turCxgwZ+x3rQbDOn9mESLowUKdYBcRc2/pdzm01DFuGQkmrG01+xfF+Gxj3DRAxv3LEsW0zFl/iQ31G3viDJclyPGH8PCUO3FOV1kwJfHAbRasi1iRFtA8xjMgTbkn9YTsL/QEvSf9E51aiUqNUryLhzafhgeM3JlLo/p06ljOgwsLOPeZpRoQLTwyYn36F2af2PFtfLLnwbShxfojxaP0nz4DdwNoD0PUwAmULCgqZt/VwXX9U6uS5plf6KAhBNBi1pvAJtqQqzX6GCMOv+l1g0cXKHh05nu55DUZ7/nw8nggxL33bcramVkfoSbhUEYUpvwbmdOLY5KUkAfIVwitzwq6dcjORJjUjyt/CZh73jeUoj6hQz5V4hYuYweFIpB9XrAr6sT623v8lsygBfr0xNj9LlVp/EF1hFM1wQVC4Tr6Ud8mftFXi2ne49FMoWF6g2vRCG7odEfaEkYVFGTQMW9pxyMw4ODYQ6oYiDvZs++Oa5NwFKmFlk2kNW86Imvxrkifaal7/seiAT8EUAGn3T74/KXlfSAPraWEGLlZWGz+UQCj9m6HA2bxv0DLW6Txe9QsM3+kx27dFos0VR8gUmE4kzB1hlDBKxzhCynbPjHy8GS7Azlvex2n8U33+KX+6Q== ngnclht@gmail.com'
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($admin) {
  $f = "$env:ProgramData\ssh\administrators_authorized_keys"
  Add-Content -Path $f -Value $key
  icacls $f /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F" | Out-Null
} else {
  New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.ssh" | Out-Null
  Add-Content -Path "$env:USERPROFILE\.ssh\authorized_keys" -Value $key
}
"Username : " + (whoami)
"IP       : " + ((Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -match '^(192\.168|10\.|172\.(1[6-9]|2[0-9]|3[0-1]))' }).IPAddress -join ', ')
```

> **Admin-account gotcha:** for an administrator account, Windows OpenSSH reads the key from
> `C:\ProgramData\ssh\administrators_authorized_keys` (ACLs restricted to Administrators+SYSTEM),
> **not** `~/.ssh/authorized_keys`. The script above handles both.

Record the printed **Username** and **LAN IP** (reserve a static IP in the router so it's stable).

### 5.2 One-time: build toolchain (install over SSH, prefer `winget`)

- **Rust** (MSVC) + `rustup target add x86_64-pc-windows-msvc`
- **Visual Studio Build Tools** (MSVC v143 + Windows 10/11 SDK — the SDK provides `signtool`)
- **Node + pnpm**, **Git**
- **WebView2 runtime** (preinstalled on Win11; auto on updated Win10)
- NSIS (Tauri can fetch automatically)

### 5.3 Per-release build workflow (to become a `build-desktop-exe` skill)

1. SSH from the Mac into the PC over the LAN.
2. PC pulls the repo (or rsync/scp source over).
3. `pnpm install` → `pnpm --filter @ctracking/desktop tauri build --target x86_64-pc-windows-msvc`
   → NSIS `.exe` under `apps/desktop/src-tauri/target/.../release/bundle/nsis/`.
4. Sign with `signtool` (see §6).
5. `scp` the signed installer back to the Mac → `deploy/build.sh` stages it →
   `web/download/BiBoEmployeeTracking-Windows-x64.exe` (stable link; same `?v=`/cache-bust
   discipline as the DMG — see `deploy-employeetracking` skill).

Alternative to SSH: register the PC as a **self-hosted GitHub Actions runner** for push-button
CI on tagged releases. More setup; defer unless wanted.

## 6. Code signing (Authenticode) — decision needed

Unsigned `.exe` trips SmartScreen/Defender. Options:
- **Azure Trusted Signing** — cheap, Microsoft-managed, good reputation. *(Recommended.)*
- **OV cert** — cheap; SmartScreen reputation builds over time.
- **EV cert** — instant SmartScreen trust; pricier.

We can build/test **unsigned** first and add signing before the public download goes live.

## 7. Open decisions

1. Build infra: LAN Win10 PC over SSH *(chosen)* vs self-hosted CI runner.
2. Signing: Azure Trusted Signing vs OV vs EV.
3. Min OS / arch: Windows 10 (1809+) & 11, x64 only for v1 (no ARM64).
4. Installer: NSIS (smaller, recommended) vs MSI (enterprise/GPO).
5. Versioning: shared version across mac+win (next 1.1.0) vs independent tracks.
6. Consent model: add first-run consent + Settings opt-outs on Windows (recommended).

## 8. Top risks

- Low-level keyboard hook can't observe input into higher-integrity/elevated foreground apps —
  degrade gracefully + document; Raw Input fallback.
- SmartScreen/Defender on a low-reputation installer — resolve via signing (§6).
- No Windows build env until §5 is set up — main new infra.
- `xcap` performance / mixed-DPI on Windows — validate early (M1).
