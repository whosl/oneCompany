# Repository Guidelines

## Project Structure & Module Organization

OneCompany is a pnpm/Turbo TypeScript monorepo. Runtime applications live under `apps/`: `api` provides the Hono API and SSE endpoints, `tui` is the primary TUI2 client, and `webui` is the React/Vite console. Shared implementation is split across `packages/agent-core`, `workflow`, `workspace`, `integrations`, `shared`, and `oc-gateway-mcp`. Keep tests beside their source as `*.test.ts`; broader scenarios belong in `apps/api/src/integration/`. Operational scripts live in `scripts/`, integration presets in `config/`, offline capabilities in `skill-packs/`, and contributor-facing material in `docs/`.

## Build, Test, and Development Commands

- `pnpm install`: install all workspace dependencies.
- `pnpm migrate`: initialize or update the local SQLite schema.
- `pnpm api`: run the API at `http://localhost:3001`.
- `pnpm tui2`: launch the terminal client; add `--project <id>` to open a project.
- `pnpm webui`: run the WebUI at `http://localhost:3010`.
- `pnpm build`: build all packages through Turbo.
- `pnpm typecheck`: run strict TypeScript checks across the monorepo.
- `pnpm test`: run Vitest suites across test-enabled packages.
- `pnpm lint` / `pnpm format`: run ESLint or apply Prettier formatting.

Use filters for focused work, for example `pnpm --filter @oc/api test -- src/events/sse.test.ts`.

## Coding Style & Naming Conventions

Use TypeScript ESM, two-space indentation, semicolons, and double quotes, matching existing files. Prefer small domain modules with explicit exported types. Use `camelCase` for values/functions, `PascalCase` for React components and types, and kebab-case directories. Strict TypeScript and `noUncheckedIndexedAccess` are enabled. Prefix intentionally unused variables with `_`; ESLint rejects other unused bindings.

## Testing Guidelines

Vitest runs in Node with 30-second test and hook timeouts. Name tests `feature.test.ts` and keep fixtures deterministic. Add integration coverage when changing persisted events, gates, workflow transitions, SSE, or cross-package contracts. Before submitting, run `pnpm typecheck`, the affected package tests, and `pnpm build`. UI changes should also be checked in the browser at desktop and mobile widths.

## Commit & Pull Request Guidelines

Follow Conventional Commits seen in history: `feat(webui): ...`, `fix(mcp-governance): ...`, `test(project-mcp): ...`, or `docs: ...`. Keep commits focused and imperative. Pull requests should explain behavior changes, list verification commands, link relevant issues, and include screenshots for visible UI changes. Call out schema, environment, security, or migration impacts explicitly.

## Security & Configuration Tips

Copy `.env.example` to `.env`; never commit credentials, `.mcp.json`, databases, generated projects, or build output. Do not use `OC_USE_STUB_ENGINE=1` for production acceptance. Preserve MCP allowlists, namespace checks, secret redaction, and human gates around risky operations.
