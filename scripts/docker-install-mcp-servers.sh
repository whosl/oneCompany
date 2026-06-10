#!/usr/bin/env bash
# Pre-install stdio MCP servers for Integration Gateway / oc-gateway-mcp (PR-D).
set -euo pipefail

ROOT="${1:-/opt/onecompany}"
MCP_ROOT="${OC_MCP_SERVERS_ROOT:-${ROOT}/mcp-servers}"

if [[ ! -f "${MCP_ROOT}/package.json" ]]; then
  echo "[mcp] missing ${MCP_ROOT}/package.json — skip"
  exit 0
fi

cd "${MCP_ROOT}"
echo "[mcp] installing connector MCP servers into ${MCP_ROOT}..."
npm install --omit=dev --no-audit --no-fund
echo "[mcp] ready: $(find node_modules/.bin -maxdepth 1 -type l -o -type f 2>/dev/null | wc -l | tr -d ' ') binaries"
