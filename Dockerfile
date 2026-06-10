# OneCompany — minimal Ubuntu 22.04 image (API + Web in one container)
# syntax=docker/dockerfile:1

FROM ubuntu:22.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    python3 \
    make \
    g++ \
  && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
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

ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers
ENV OC_MCP_SERVERS_ROOT=/opt/onecompany/mcp-servers
ENV OC_INTEGRATION_MCP_MANIFEST=/opt/onecompany/config/integration-mcp-manifest.json
ENV OC_GATEWAY_MCP_CONFIG=/opt/onecompany/config/oc-gateway-mcp.json

RUN pnpm install --frozen-lockfile
RUN chmod +x scripts/docker-install-playwright.sh scripts/docker-install-mcp-servers.sh \
  && scripts/docker-install-playwright.sh /opt/onecompany \
  && scripts/docker-install-mcp-servers.sh /opt/onecompany
RUN pnpm --filter @oc/oc-gateway-mcp build
RUN pnpm build

# Initialize SQLite schema at build time (overridden when a data volume is mounted).
ENV OC_DB_PATH=/opt/onecompany/data/app.sqlite
RUN mkdir -p /opt/onecompany/data \
  && cd packages/shared \
  && pnpm migrate

FROM ubuntu:22.04 AS runtime

ENV DEBIAN_FRONTEND=noninteractive
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    tini \
  && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && corepack enable \
  && corepack prepare pnpm@9.15.0 --activate \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/onecompany

COPY --from=builder /opt/onecompany /opt/onecompany
COPY --from=builder /opt/playwright-browsers /opt/playwright-browsers

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
ENV NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_BASE=/api
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

EXPOSE 3000

COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
