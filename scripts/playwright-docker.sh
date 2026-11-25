#!/usr/bin/env bash
# Runs the Playwright suite inside the official Linux image, from a clean copy of the repository
# (fresh `npm ci`, no host node_modules). Use it to check or regenerate the visual baselines on Linux.
#
#   bash scripts/playwright-docker.sh                       # whole suite
#   bash scripts/playwright-docker.sh 13-visual             # visual tests only
#   bash scripts/playwright-docker.sh 13-visual --update-snapshots
#
# Results are copied back: test-results/, docs/test-report/ and tests/e2e/__screenshots__/.
set -euo pipefail

IMAGE="mcr.microsoft.com/playwright:v1.65.1-noble"
# Git Bash on Windows needs a Windows-style path for the volume and no MSYS path rewriting.
HOST_DIR="$(pwd -W 2>/dev/null || pwd)"
export MSYS_NO_PATHCONV=1

docker run --rm --ipc=host -e CI=1 -v "${HOST_DIR}:/src" -w /work "$IMAGE" bash -c '
  set -u
  tar -C /src --exclude=./node_modules --exclude=./dist --exclude=./test-results --exclude=./.git -cf - . | tar -xf -
  npm ci --no-audit --no-fund --loglevel=error || exit 1
  npx playwright test "$@"
  status=$?
  rm -rf /src/test-results /src/docs/test-report
  cp -r test-results /src/ 2>/dev/null || true
  cp -r docs/test-report /src/docs/ 2>/dev/null || true
  cp -r tests/e2e/__screenshots__/. /src/tests/e2e/__screenshots__/
  exit $status
' -- "$@"
