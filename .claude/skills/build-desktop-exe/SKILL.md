---
name: build-desktop-exe
description: Build the BiBoEmployeeTracking Windows desktop app (Tauri) as an NSIS .exe installer, driven from the Mac over SSH against the LAN Windows build PC (`ssh winbuild`). Syncs the repo, installs deps, runs the x86_64-pc-windows-msvc release build, locates + verifies the installer, and copies it back to the Mac. Use whenever the user wants to build/rebuild/release/ship the Windows desktop app or produce a Windows .exe installer.
---

# Build the BiBoEmployeeTracking Windows app (NSIS .exe)

Tauri Windows installers **must** be built on Windows (MSVC + WebView2 + NSIS) — we
cannot cross-build from the Mac. This skill drives a **LAN Windows 10 PC over SSH**
(alias `winbuild`), the same way `deploy-employeetracking` drives the VPS. The backend
URL is baked at compile time (production), so the artifact points at
`https://employeetracking.namnguyen.pro` out of the box.

See [docs/12-windows-support-plan.md](../../../docs/12-windows-support-plan.md) §5 and
the tracker [docs/13-windows-support-ticket.md](../../../docs/13-windows-support-ticket.md).

## Prerequisites (already set up — verify if a build fails)

- **`ssh winbuild` works** (key auth). It's a LAN host, so the Mac and PC must be on the
  **same subnet** (Parsec works over the internet and hides subnet splits — check
  `ssh winbuild whoami` first). Host: `DESKTOP-TUL98UA`, user `admin`, Win10 Pro.
- Toolchain on the PC: Rust 1.96 (MSVC) + `x86_64-pc-windows-msvc` target, VS Build
  Tools 2026 (MSVC v143 + Windows SDK 10.0.26100 → `signtool`), Node 24, pnpm (via
  corepack), Git, WebView2. NSIS is fetched by Tauri automatically.
- The PC only needs to be **on during the build** (~10–20 min release). Keep it awake.

## 1. Bump the version (keep all THREE in sync)

Same as the DMG: set the same version in `apps/desktop/package.json`,
`apps/desktop/src-tauri/tauri.conf.json`, and `apps/desktop/src-tauri/Cargo.toml`.
The NSIS installer filename follows `tauri.conf.json`.

## 2. Sync the repo to the PC

Tar from the repo root **with `COPYFILE_DISABLE=1`** (critical — otherwise macOS injects
`._*` AppleDouble files that make `tauri-build` fail with "stream did not contain valid
UTF-8" on `capabilities/`). Preserve `node_modules`/`target` on the PC for incremental
builds by extracting over the existing `C:\ct` tree:

```bash
cd /Users/namng/Work/ctracking
COPYFILE_DISABLE=1 tar czf /tmp/repo.tgz \
  --exclude=node_modules --exclude=target --exclude=.git --exclude=dist \
  --exclude='*.dmg' --exclude='*.app' .
scp -q /tmp/repo.tgz winbuild:repo.tgz
ssh winbuild 'tar -xzf $env:USERPROFILE\repo.tgz -C C:\ct'   # first time: mkdir C:\ct
```

For a clean build, `Remove-Item -Recurse -Force C:\ct` first (forces a full recompile).

## 3. Install deps + build (release, NSIS)

`cargo`/`pnpm` aren't on the non-login SSH PATH — prepend cargo's bin. Run in the
**background** (release compiles every crate; ~10–20 min on the i5-9400F) and wait for the
completion notification:

```bash
ssh winbuild 'Set-Location C:\ct; corepack pnpm install'
ssh winbuild 'Set-Location C:\ct; $env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; `
  corepack pnpm --filter @ctracking/desktop tauri build --target x86_64-pc-windows-msvc `
  2>&1 | Tee-Object $env:USERPROFILE\build.log | Select-Object -Last 30'
```

Note: PowerShell over SSH returns a non-zero exit because cargo writes progress to
stderr — **judge success by the log**, not the exit code. Look for
`Finished \`release\`` and `Built application at` / the NSIS line.

Installer lands at:
```
C:\ct\apps\desktop\src-tauri\target\x86_64-pc-windows-msvc\release\bundle\nsis\
  employeetrack_<version>_x64-setup.exe
```

## 4. Verify

```bash
ssh winbuild 'Get-ChildItem C:\ct\apps\desktop\src-tauri\target\x86_64-pc-windows-msvc\release\bundle\nsis\*.exe | Select Name,Length'
# Optional smoke test of the raw exe (non-installer; named ctracking.exe — the cargo
# bin name) — launch in the INTERACTIVE session so it shows on the Parsec screen (a GUI
# app started from plain SSH won't appear):
ssh winbuild '$exe="C:\ct\apps\desktop\src-tauri\target\x86_64-pc-windows-msvc\release\ctracking.exe"; schtasks /create /tn ctsmoke /tr "$exe" /sc once /st 00:00 /ru admin /it /f; schtasks /run /tn ctsmoke'
ssh winbuild 'Start-Sleep 4; $p=(Get-Process ctracking -ErrorAction SilentlyContinue).Id; if($p){ Invoke-RestMethod "http://127.0.0.1:$((Get-NetTCPConnection -State Listen -OwningProcess $p).LocalPort | Select -First 1)/whoami" }; schtasks /delete /tn ctsmoke /f'
```
`whoami` should return `{"app":"employeetrack","version":"<v>","token":"<32 hex>"}`.

## 5. Copy the installer back to the Mac

```bash
scp winbuild:'C:\ct\apps\desktop\src-tauri\target\x86_64-pc-windows-msvc\release\bundle\nsis\employeetrack_*_x64-setup.exe' /tmp/
```

Then (task 77 / `deploy-employeetracking`) stage it at
`web/download/BiBoEmployeeTracking-Windows-x64.exe` with the `?v=` cache-bust discipline.

## Notes / gotchas

- **Signing:** this skill builds **unsigned**. Authenticode signing (Azure Trusted Signing /
  OV / EV) is task 75 — add it before the public download goes live or SmartScreen will warn.
- **Consent on first run:** Windows shows a first-run consent screen; capture stays off
  until the user consents (by design — there are no per-feature OS prompts).
- **`--no-bundle --debug`** gives a faster runnable `target/debug/ctracking.exe` (non-dev
  mode, embeds the frontend) for quick iteration without producing the installer.
