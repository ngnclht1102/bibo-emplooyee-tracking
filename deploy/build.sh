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

echo "==> Building web-admin (same-origin /v1)…"
# No VITE_API_BASE → relative URLs, served by the backend on the same origin.
( cd "$ROOT" && pnpm --filter @ctracking/web-admin build )
cp -R "$ROOT/apps/web-admin/dist/." "$DIST/web/"

echo "==> Done. Artifacts in $DIST (version $VERSION)"
