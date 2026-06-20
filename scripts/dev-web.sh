#!/usr/bin/env bash
# Run the web-admin dev server (Vite). Serves the SPA at /admin and proxies /v1 to
# the backend on :8080. Signup wizard lives at /admin/signup.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/web-admin"

echo "→ web-admin on http://localhost:5174/admin/  (signup: /admin/signup)"
pnpm dev
