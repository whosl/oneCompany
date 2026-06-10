#!/usr/bin/env bash
# Install Playwright Chromium + Ubuntu system deps for headless browser use in Docker.
set -euo pipefail

ROOT="${1:-/opt/onecompany}"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/playwright-browsers}"

mkdir -p "${PLAYWRIGHT_BROWSERS_PATH}"

cd "${ROOT}/packages/integrations"
echo "[playwright] installing chromium to ${PLAYWRIGHT_BROWSERS_PATH}..."
pnpm exec playwright-core install --with-deps chromium
