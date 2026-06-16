# Repository Guidelines

## Project Shape

- OneCompany is a pnpm/Turbo monorepo. Workspace packages are only `apps/*` and `packages/*` (see `pnpm-workspace.yaml`).
- Runtime apps: `apps/api` (Hono API + SSE), `apps/tui` (TUI2 client), `apps/webui` (React/Vite console).
- Shared/runtime packages: `agent-core`, `workflow`, `workspace`, `integrations`, `shared`, `oc-gateway-mcp`, `opencode-plugin`.
- Keep tests with implementation as `*.test.ts`; broader cross-flow scenarios are under `apps/api/src/integration/`.

## Setup and Common Commands

- Bootstrap: `cp .env.example .env` then `pnpm install`.
- Initialize schema before first run: `pnpm migrate` (delegates to `@oc/shared`).
- Start all local dev processes: `pnpm dev` (runs package `dev` tasks with Turbo).
- API/TUI/WebUI separately: `pnpm api` (`:3001`), `pnpm tui2`, `pnpm webui` (`:3010`).
- Useful one-liners:
  - `pnpm build` (full workspace)
  - `pnpm test`
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm format` (Prettier)
- Focused checks use filters, e.g. `pnpm --filter @oc/api test -- src/events/sse.test.ts`.

## Source-of-Truth Config (easy-to-miss)

- `api` loads root `.env` explicitly (`apps/api/src/index.ts`); env values in subprocesses are not automatically inherited unless exported.
- DB path behavior is env-driven in `packages/shared/src/db/paths.ts`:
  - `OC_TEST_DB_PATH` (test harness)
  - `OC_DB_PATH` (runtime)
  - otherwise `<cwd>/data/app.sqlite`.
- `packages/workspace` defaults generated project root to `OC_GENERATED_PROJECTS_ROOT` or `./generated-projects`; this directory is gitignored.
- `apps/webui/vite.config.ts` proxies `/api` to `127.0.0.1:3001`; nginx in `apps/webui/nginx.conf` uses `/api/` and `/preview/` pass-through.
- OpenCode plugin wiring is in `.opencode/opencode.json` and `.opencode/tui.json`, both with machine-specific absolute paths.

## Verification Order and Expensive Flows

- `pnpm migrate` should precede API/TUI startup in fresh repos.
- In CI, expensive real-engine integration checks run as: `pnpm migrate`, `pnpm -w build`, then `pnpm --filter @oc/api vitest run src/integration/golden-path.test.ts` with `OC_OPENCODE_INTEGRATION=1`.
- `apps/api/src/integration/golden-path.test.ts` is skipped unless `OC_OPENCODE_INTEGRATION` is set.

## Docker and Deployment

- Production mode is `docker compose up --build` using `Dockerfile` + `docker-compose.yml` (ports: API `3001`, WebUI `3010`).
- Hot-reload/dev override is `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build`.
- API container entrypoint runs schema migration before starting (`scripts/docker-entrypoint.sh`), so code changes touching migrations often still require container rebuild.
- Use `docker compose exec onecompany-api pnpm tui2 --api http://127.0.0.1:3001` for container-side TUI access.

## Engine and Integration Gotchas

- `OC_USE_STUB_ENGINE=1` is a test-mode shortcut; avoid for production acceptance (also noted in `apps/tui` help).
- Workflow LLM vars (`OC_LLM_API_KEY`, `OC_LLM_BASE_URL`, `OC_WORKFLOW_MODEL_*`) and coding vars differ from coding vars (`OC_OPENCODE_MODEL_*`), which should be `provider/model` values.
- Integration adapter mode is controlled by `OC_INTEGRATION_ADAPTER_MODE` (default `real` in docker paths); manifest and gateway behavior come from `config/integration-mcp-manifest.json` and `config/oc-gateway-mcp.json`.

## Testing Constraints

- Vitest config sets 30s test/hook timeouts; API integration tests also run with an intentional long poll.
- `apps/api/vitest.config.ts` excludes `**/generated-projects/**` from API test collection.
- Run narrower tests first when iterating on failures, then run package/workspace verification.

## Style and CI Conventions

- ESM TS with `strict`, `noUncheckedIndexedAccess`, two-space indent, semicolons, and double quotes.
- ESLint enforces TypeScript unused-variable prefixes (`_` for intentionally unused).
- OpenCode plugin lifecycle that matters to CI/runtime:
  - `pnpm opencode-plugin:build`
  - `pnpm opencode-plugin:install`
- Suggested commit style: Conventional Commits (`feat(...)`, `fix(...)`, `test(...)`, `docs(...)`), focused and imperative.
- Never commit secrets or generated artifacts: `.env`, `.env.docker`, `data/*`, `generated-projects/*`, `.mcp.json`, build caches/outputs.
