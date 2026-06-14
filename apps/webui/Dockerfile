# OneCompany — WebUI (static build served by nginx, /api proxied to API container)
# syntax=docker/dockerfile:1

# ─── Builder: pnpm build the React app ──────────────────────────────────────
FROM ubuntu:22.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates curl git python3 make g++ \
  && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && corepack enable \
  && corepack prepare pnpm@9.15.0 --activate \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/onecompany

# Copy only what's needed to install + build webui (full workspace needed for deps).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @oc/webui build

# ─── Runtime: nginx serves the static dist ──────────────────────────────────
FROM nginx:alpine AS runtime

# Remove default nginx static assets and config.
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

COPY --from=builder /opt/onecompany/apps/webui/dist /usr/share/nginx/html
COPY apps/webui/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
