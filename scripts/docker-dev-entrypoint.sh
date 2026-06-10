#!/usr/bin/env bash
set -euo pipefail

ROOT="/opt/onecompany"

export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/playwright-browsers}"
export OC_INTEGRATION_ADAPTER_MODE="${OC_INTEGRATION_ADAPTER_MODE:-real}"
export OC_MCP_SERVERS_ROOT="${OC_MCP_SERVERS_ROOT:-/opt/onecompany/mcp-servers}"
export OC_INTEGRATION_MCP_MANIFEST="${OC_INTEGRATION_MCP_MANIFEST:-/opt/onecompany/config/integration-mcp-manifest.json}"
export OC_GATEWAY_MCP_CONFIG="${OC_GATEWAY_MCP_CONFIG:-/opt/onecompany/config/oc-gateway-mcp.json}"
export PATH="${OC_MCP_SERVERS_ROOT}/node_modules/.bin:${PATH}"

ensure_mcp_servers() {
  if [[ ! -f "${OC_MCP_SERVERS_ROOT}/package.json" ]]; then
    return 0
  fi
  if [[ -d "${OC_MCP_SERVERS_ROOT}/node_modules" ]] && [[ -n "$(ls -A "${OC_MCP_SERVERS_ROOT}/node_modules" 2>/dev/null)" ]]; then
    return 0
  fi
  echo "[onecompany-dev] MCP server packages missing — installing..."
  bash "${ROOT}/scripts/docker-install-mcp-servers.sh" "${ROOT}"
}

ensure_playwright_browsers() {
  if [[ "${OC_INTEGRATION_ADAPTER_MODE}" != "real" ]]; then
    return 0
  fi
  if [[ -d "${PLAYWRIGHT_BROWSERS_PATH}" ]] && [[ -n "$(ls -A "${PLAYWRIGHT_BROWSERS_PATH}" 2>/dev/null)" ]]; then
    return 0
  fi
  echo "[onecompany-dev] Playwright browsers missing — installing chromium..."
  bash "${ROOT}/scripts/docker-install-playwright.sh" "${ROOT}"
}

ensure_opencode_cli() {
  if command -v opencode >/dev/null 2>&1; then
    return 0
  fi
  echo "[onecompany-dev] OpenCode CLI missing — installing..."
  bash "${ROOT}/scripts/docker-install-opencode.sh"
}

mkdir -p "$(dirname "${OC_DB_PATH:-/opt/onecompany/data/app.sqlite}")" \
  "${OC_GENERATED_PROJECTS_ROOT:-/var/lib/onecompany/generated-projects}"

ensure_playwright_browsers
ensure_mcp_servers
ensure_opencode_cli

cd "${ROOT}"
echo "[onecompany-dev] installing dependencies..."
pnpm install

echo "[onecompany-dev] applying database schema..."
cd "${ROOT}/packages/shared"
OC_DB_PATH="${OC_DB_PATH:-/opt/onecompany/data/app.sqlite}" pnpm migrate

export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-/api}"
export NEXT_PUBLIC_API_BASE="${NEXT_PUBLIC_API_BASE:-/api}"
export API_URL="${API_URL:-http://127.0.0.1:3001}"

echo "[onecompany-dev] starting API dev server on :3001..."
cd "${ROOT}/apps/api"
pnpm dev &
API_PID=$!

echo "[onecompany-dev] starting Web dev server on :3000..."
cd "${ROOT}/apps/web"
pnpm dev --hostname 0.0.0.0 --port 3000 &
WEB_PID=$!

shutdown() {
  echo "[onecompany-dev] shutting down..."
  kill "${API_PID}" "${WEB_PID}" 2>/dev/null || true
  wait "${API_PID}" "${WEB_PID}" 2>/dev/null || true
}

trap shutdown SIGTERM SIGINT

wait -n
EXIT_CODE=$?
shutdown
exit "${EXIT_CODE}"
