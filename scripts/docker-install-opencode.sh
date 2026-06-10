#!/usr/bin/env bash
# Install OpenCode CLI for coding slices inside Docker (Linux).
set -euo pipefail

if command -v opencode >/dev/null 2>&1; then
  echo "[opencode] already installed: $(command -v opencode)"
  opencode --version
  exit 0
fi

echo "[opencode] installing opencode-ai via npm..."
npm install -g opencode-ai@latest

if ! command -v opencode >/dev/null 2>&1; then
  echo "[opencode] install finished but opencode is not on PATH" >&2
  exit 1
fi

echo "[opencode] installed: $(command -v opencode)"
opencode --version
