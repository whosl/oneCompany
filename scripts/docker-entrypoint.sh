#!/usr/bin/env bash
set -euo pipefail

ROOT="/opt/onecompany"

export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/playwright-browsers}"
export OC_INTEGRATION_ADAPTER_MODE="${OC_INTEGRATION_ADAPTER_MODE:-real}"
export OC_MCP_SERVERS_ROOT="${OC_MCP_SERVERS_ROOT:-/opt/onecompany/mcp-servers}"
export OC_INTEGRATION_MCP_MANIFEST="${OC_INTEGRATION_MCP_MANIFEST:-/opt/onecompany/config/integration-mcp-manifest.json}"
export OC_GATEWAY_MCP_CONFIG="${OC_GATEWAY_MCP_CONFIG:-/opt/onecompany/config/oc-gateway-mcp.json}"
export PATH="${OC_MCP_SERVERS_ROOT}/node_modules/.bin:${PATH}"

mkdir -p "$(dirname "${OC_DB_PATH}")" "${OC_GENERATED_PROJECTS_ROOT}"

echo "[onecompany] applying database schema..."
cd "${ROOT}/packages/shared"
pnpm migrate

echo "[onecompany] starting API on :3001..."
cd "${ROOT}/apps/api"
node dist/index.js &
API_PID=$!

echo "[onecompany] starting Web on :${PORT}..."
cd "${ROOT}/apps/web"
pnpm exec next start --hostname "${HOSTNAME}" --port "${PORT}" &
WEB_PID=$!

shutdown() {
  echo "[onecompany] shutting down..."
  kill "${API_PID}" "${WEB_PID}" 2>/dev/null || true
  wait "${API_PID}" "${WEB_PID}" 2>/dev/null || true
}

trap shutdown SIGTERM SIGINT

wait -n
EXIT_CODE=$?
shutdown
exit "${EXIT_CODE}"
