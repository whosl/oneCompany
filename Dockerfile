# OneCompany — API runtime
# syntax=docker/dockerfile:1

# ─── Builder: install deps, build, bake playwright/mcp/opencode/codegraph ───
FROM ubuntu:22.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH="${PNPM_HOME}:/usr/local/bin:${PATH}"

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    python3 \
    make \
    g++ \
  && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && corepack enable \
  && corepack prepare pnpm@9.15.0 --activate \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/onecompany

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY skill-packs ./skill-packs
COPY config ./config
COPY mcp-servers ./mcp-servers
COPY scripts/docker-install-playwright.sh ./scripts/docker-install-playwright.sh
COPY scripts/docker-install-mcp-servers.sh ./scripts/docker-install-mcp-servers.sh
COPY scripts/docker-install-opencode.sh ./scripts/docker-install-opencode.sh

ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers
ENV OC_MCP_SERVERS_ROOT=/opt/onecompany/mcp-servers
ENV OC_INTEGRATION_MCP_MANIFEST=/opt/onecompany/config/integration-mcp-manifest.json
ENV OC_GATEWAY_MCP_CONFIG=/opt/onecompany/config/oc-gateway-mcp.json

RUN pnpm install --frozen-lockfile
RUN chmod +x scripts/docker-install-playwright.sh scripts/docker-install-mcp-servers.sh scripts/docker-install-opencode.sh \
  && scripts/docker-install-playwright.sh /opt/onecompany \
  && scripts/docker-install-mcp-servers.sh /opt/onecompany \
  && scripts/docker-install-opencode.sh

# codegraph CLI — used by project-level MCP to provide code intelligence.
# Installed globally so it lands on PATH for both build-time init and runtime serve.
RUN npm install -g @colbymchenry/codegraph

RUN pnpm --filter @oc/oc-gateway-mcp build
RUN pnpm build

# Initialize SQLite schema at build time (overridden when a data volume is mounted).
ENV OC_DB_PATH=/opt/onecompany/data/app.sqlite
RUN mkdir -p /opt/onecompany/data \
  && cd packages/shared \
  && pnpm migrate

# ─── Runtime: slim production image ─────────────────────────────────────────
FROM ubuntu:22.04 AS runtime

ENV DEBIAN_FRONTEND=noninteractive
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH="${PNPM_HOME}:/usr/local/bin:/usr/lib/node_modules/.bin:${PATH}"
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    tini \
  && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && corepack enable \
  && corepack prepare pnpm@9.15.0 --activate \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/onecompany

# Copy the built application and baked-in assets from builder.
COPY --from=builder /opt/onecompany /opt/onecompany
COPY --from=builder /opt/playwright-browsers /opt/playwright-browsers
# Global npm packages (codegraph + opencode-ai) — copy node_modules and recreate
# the bin symlinks since /usr/local/bin symlinks don't survive the COPY.
COPY --from=builder /usr/lib/node_modules /usr/lib/node_modules
RUN ln -sf /usr/lib/node_modules/@colbymchenry/codegraph/npm-shim.js /usr/local/bin/codegraph \
  && ln -sf /usr/lib/node_modules/opencode-ai/bin/opencode.exe /usr/local/bin/opencode

# Prune devDependencies to shrink the image (keeps dist/ + prod deps + scripts).
RUN pnpm prune --prod \
  && rm -rf /root/.local/share/pnpm/store /tmp/*

RUN mkdir -p /var/lib/onecompany/generated-projects /opt/onecompany/data \
  && apt-get update \
  && cd /opt/onecompany/packages/integrations \
  && PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers pnpm exec playwright-core install-deps chromium \
  && rm -rf /var/lib/apt/lists/*

ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers
ENV OC_MCP_SERVERS_ROOT=/opt/onecompany/mcp-servers
ENV OC_INTEGRATION_MCP_MANIFEST=/opt/onecompany/config/integration-mcp-manifest.json
ENV OC_GATEWAY_MCP_CONFIG=/opt/onecompany/config/oc-gateway-mcp.json
ENV PATH="/opt/onecompany/mcp-servers/node_modules/.bin:${PATH}"
ENV OC_DB_PATH=/opt/onecompany/data/app.sqlite
ENV OC_GENERATED_PROJECTS_ROOT=/var/lib/onecompany/generated-projects
ENV OC_SKILL_PACKS_ROOT=/opt/onecompany/skill-packs
ENV OC_INTEGRATION_ADAPTER_MODE=real
ENV OC_TESTING_INTEGRATION_CHECKS=1
ENV API_URL=http://127.0.0.1:3001
ENV PORT=3001

EXPOSE 3001

COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
