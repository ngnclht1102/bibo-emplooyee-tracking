#!/usr/bin/env bash
# Sign a built .app with the stable dev identity so macOS TCC keeps granted
# permissions across rebuilds (see docs/08-dev-codesigning.md).
#
# Usage: scripts/sign-macos.sh <path-to-.app>
set -euo pipefail

APP_PATH="${1:?usage: sign-macos.sh <path-to-.app>}"
IDENTITY="${CTRACKING_SIGN_IDENTITY:-Apple Development: ngnclht@gmail.com (CGC2675CK3)}"

if [ ! -d "$APP_PATH" ]; then
  echo "error: app not found at $APP_PATH" >&2
  exit 1
fi

echo "Signing $APP_PATH with: $IDENTITY"
codesign --force --deep --options runtime --sign "$IDENTITY" "$APP_PATH"
codesign --verify --deep --strict --verbose=2 "$APP_PATH"
echo "Signed. Identity:"
codesign -dv --verbose=4 "$APP_PATH" 2>&1 | grep -E "Authority|Identifier|TeamIdentifier" || true
