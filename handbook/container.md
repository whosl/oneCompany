# OneCompany Container (Ubuntu 22.04)

Minimal single-container image: **API (:3001 internal) + Web (:3000)** on `ubuntu:22.04`.

## Quick start

```bash
cp .env.docker.example .env.docker
# edit .env.docker — at minimum set OPENAI_API_KEY and ZHIPU_API_KEY

docker compose up --build
```

Open **http://localhost:3000** (UI proxies API via `/api` → `127.0.0.1:3001`).

## Image layout

| Path | Purpose |
|------|---------|
| `/opt/onecompany` | Monorepo install (built) |
| `/opt/onecompany/data/app.sqlite` | SQLite DB (`OC_DB_PATH`) |
| `/var/lib/onecompany/generated-projects` | Generated app workspaces |
| `/opt/onecompany/skill-packs` | Offline integration packs |

## Environment

| Variable | Default in image | Purpose |
|----------|------------------|---------|
| `OC_DB_PATH` | `/opt/onecompany/data/app.sqlite` | Database file |
| `OC_GENERATED_PROJECTS_ROOT` | `/var/lib/onecompany/generated-projects` | Project workspaces |
| `NEXT_PUBLIC_API_URL` | `/api` | Browser → same-origin API proxy |
| `PLAYWRIGHT_BROWSERS_PATH` | `/opt/playwright-browsers` | Chromium install location (baked at build) |
| `OC_INTEGRATION_ADAPTER_MODE` | `real` | Native Playwright adapter (set `mock` to disable) |
| `OC_TESTING_INTEGRATION_CHECKS` | `1` | Workflow baseline/diagnostic screenshots |
| `OC_MCP_SERVERS_ROOT` | `/opt/onecompany/mcp-servers` | Pre-installed stdio MCP servers (P1–P3) |
| `OC_INTEGRATION_MCP_MANIFEST` | `config/integration-mcp-manifest.json` | Connector registry + npm package map |
| `OC_GATEWAY_MCP_CONFIG` | `config/oc-gateway-mcp.json` | Spawn templates for PR-D `oc-gateway-mcp` |

### Baked MCP servers (stdio)

Built into the image at `mcp-servers/node_modules` (see `config/integration-mcp-manifest.json`):

| Priority | Connector | npm package |
| --- | --- | --- |
| P1 | Figma | `figma-developer-mcp` |
| P1 | GitHub | `@modelcontextprotocol/server-github` |
| P1 | Supabase | `@supabase/mcp-server-supabase` |
| P1 | Playwright (gateway only) | `@playwright/mcp` — runtime uses native `playwright-core` |
| P1 | Vercel | native HTTP adapter planned (no stdio MCP) |
| P2 | Cloudflare | `@cloudflare/mcp-server-cloudflare` |
| P2 | Linear | `@mseep/linear-mcp` |
| P2 | Sentry | `@sentry/mcp-server` |
| P2 | PostHog | `@posthog/mcp` |
| P2 | Documentation | `@upstash/context7-mcp` |
| P2 | Postgres | `@modelcontextprotocol/server-postgres` |
| P2 | Docker | `docker-mcp` (mount `/var/run/docker.sock` for live use) |
| P3 | Stripe | `@stripe/mcp` |
| P3 | Slack | `@modelcontextprotocol/server-slack` |
| P3 | Notion | `@notionhq/notion-mcp-server` |
| P3 | Kubernetes | `mcp-server-kubernetes` |

Set connector tokens in `.env.docker` (see `.env.docker.example`). Missing secrets fall back to offline skill packs when `OC_INTEGRATION_ADAPTER_MODE=real`.

## Real engine requirements

Production workflows need:

1. **LLM key** — `OPENAI_API_KEY` or `OC_LLM_API_KEY`
2. **OpenCode CLI** — `opencode` on `PATH` (not bundled in minimal image)

Extend the Dockerfile or use a derived image to install OpenCode, for example:

```dockerfile
FROM onecompany:local
RUN npm install -g opencode@latest
```

(Verify the install command against [opencode.ai](https://opencode.ai) docs before production.)

## Build only

```bash
docker build -t onecompany:local .
docker run --rm -p 3000:3000 \
  -v onecompany-data:/opt/onecompany/data \
  -v onecompany-projects:/var/lib/onecompany/generated-projects \
  --env-file .env.docker \
  onecompany:local
```

## Notes

- **Single port**: only `3000` is exposed; API is not published separately.
- **Persistence**: use compose volumes or bind mounts for `data/` and `generated-projects/`.
- **Stub engine**: `OC_USE_STUB_ENGINE=1` is blocked in `NODE_ENV=production` unless `OC_ALLOW_STUB=1` (demo only).
