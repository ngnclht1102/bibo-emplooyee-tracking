#!/usr/bin/env bash
# Build the backend (Intel macOS binary) + the web-admin SPA into deploy/dist/.
# Pure-Go backend (pgx, no CGO) cross-compiles cleanly from Apple Silicon.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/deploy/dist"
VERSION="$(date +%Y%m%d-%H%M%S)"

rm -rf "$DIST"
mkdir -p "$DIST/bin" "$DIST/web"

echo "==> Building backend → darwin/amd64 (Intel)…"
(
  cd "$ROOT/apps/backend"
  CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 go build \
    -ldflags "-s -w -X ctracking/backend/internal/handlers.Version=$VERSION" \
    -o "$DIST/bin/ctracking-server" ./cmd/server
)

echo "==> Staging marketing site → web root…"
# Static landing page served at "/". Includes its own assets/ (screenshots, videos).
cp -R "$ROOT/marketing/site/." "$DIST/web/"
# Drop preview artifacts that may sit alongside the source.
rm -f "$DIST/web/"mksite-*.jpeg
# Cache-bust the stylesheet. The HTML is served fresh (Cloudflare cf-cache-status:
# DYNAMIC) but static .css is edge-cached for hours, so without a versioned URL a
# redeploy leaves users on a stale styles.css. Stamping ?v=$VERSION forces a fresh fetch.
sed -i '' "s|href=\"styles.css\"|href=\"styles.css?v=$VERSION\"|g" "$DIST/web/index.html"

echo "==> Staging desktop DMG → web/download (if built)…"
# Latest universal DMG from `build-desktop-dmg`. Copied into the deploy so it ships
# with web/ and survives the `rsync --delete` (vs. uploading it to the VPS by hand).
# Served at /download/EmployeeTracker-macOS.dmg (stable link, regardless of version).
DMG="$(ls -t "$ROOT"/apps/desktop/src-tauri/target/universal-apple-darwin/release/bundle/dmg/*_universal.dmg 2>/dev/null | head -1 || true)"
if [ -n "${DMG:-}" ]; then
  mkdir -p "$DIST/web/download"
  cp "$DMG" "$DIST/web/download/EmployeeTracker-macOS.dmg"
  echo "    staged $(basename "$DMG") → web/download/EmployeeTracker-macOS.dmg"
else
  echo "    WARNING: no universal DMG found — the download link will 404 until you run build-desktop-dmg"
fi

echo "==> Building web-admin (same-origin /v1, base /admin/)…"
# No VITE_API_BASE → relative URLs, served by the backend on the same origin.
( cd "$ROOT" && pnpm --filter @ctracking/web-admin build )
mkdir -p "$DIST/web/admin"
cp -R "$ROOT/apps/web-admin/dist/." "$DIST/web/admin/"

echo "==> Done. Artifacts in $DIST (version $VERSION)"
