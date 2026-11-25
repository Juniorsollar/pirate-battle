#!/usr/bin/env bash
# Regenerates package-lock.json inside the Linux Playwright image and checks `npm ci` there.
# Needed after dependency changes made on Windows: npm on Windows drops Linux-only optional
# packages (e.g. @emnapi/* used by Rolldown), which breaks `npm ci` on Linux (CI, Vercel).
set -euo pipefail

IMAGE="mcr.microsoft.com/playwright:v1.65.1-noble"
HOST_DIR="$(pwd -W 2>/dev/null || pwd)"
export MSYS_NO_PATHCONV=1

docker run --rm -v "${HOST_DIR}:/src" -w /work "$IMAGE" bash -c '
  set -e
  cp /src/package.json /src/package-lock.json .
  npm install --no-audit --no-fund --loglevel=error
  cp package-lock.json /src/package-lock.json
  rm -rf node_modules
  npm ci --no-audit --no-fund --loglevel=error
  echo "package-lock.json regenerated; npm ci OK on Linux"
'
