# Phase M0 — Foundations & Repo Setup

## Goal

Create a working monorepo. After this phase: both apps start, the database migrates, and shared types import cleanly. No product features yet.

## Prerequisites

- None. This is the first phase.
- Tools installed: Node 20+, `pnpm` 9+, `git`, Docker (only needed later, but install now).

## Concepts You Need

- Monorepo: many packages in one repo. We use pnpm workspaces + Turborepo.
- Workspace package: a folder with its own `package.json`. We name them `@oc/<name>`.
- Drizzle ORM: how we talk to SQLite. Tables are defined in TypeScript, then migrated.
- zod: runtime validation. Every shared type has a matching zod schema.
- M0 TDD exception: this phase may already be complete. If so, do not rebuild it. Add a baseline test backfill before M1 so future phases have a working test harness.

## Spec References

Read these before starting: `spec.md` §10.1, §10.2, §10.3, §3.1, §4.2, §5.2, §7, §8.1.

## Tasks

### Task 0.1 — Root tooling

Create the workspace root.

- File `package.json` (root): set `"private": true`, add scripts `build`, `dev`, `lint`, `test`, `migrate` that call `turbo`.
- File `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- File `turbo.json`: define pipelines for `build`, `lint`, `test`, `typecheck`.
- File `tsconfig.base.json`: `"strict": true`, `"module": "ESNext"`, `"moduleResolution": "Bundler"`, `"target": "ES2022"`.
- Add `.gitignore` with `node_modules`, `data/app.sqlite`, `.next`, `dist`, `generated-projects`.
- Add ESLint + Prettier + a root `vitest.config.ts`.

Verify: `pnpm install` runs with no error.

### Task 0.2 — Scaffold `apps/web`

- Create a Next.js app in `apps/web` with TypeScript, Tailwind CSS, and shadcn/ui initialized.
- Add a single placeholder page that renders the text `OneCompany`.

Verify: `pnpm --filter @oc/web dev` starts and the page shows `OneCompany`.

### Task 0.3 — Scaffold `apps/api`

- Create a Hono app in `apps/api`.
- Add one route `GET /health` returning `{ "ok": true }`.

Verify: start the api, then `curl localhost:3001/health` returns `{"ok":true}`.

### Task 0.4 — Scaffold packages

Create empty buildable packages, each with `package.json` (name `@oc/<name>`), `tsconfig.json` extending the base, and `src/index.ts`:

- `packages/shared`
- `packages/agent-core`
- `packages/workflow`
- `packages/workspace`
- `packages/ui`

Verify: `pnpm -w build` builds all packages with no error.

### Task 0.5 — Database + migrations

- Add Drizzle ORM + Drizzle Kit + a SQLite driver to `packages/shared` (or a new `packages/db`; keep it simple, put it in `shared/src/db`).
- Configure the DB file path `data/app.sqlite`.
- Add a `migrate` script that creates tables.

Verify: `pnpm migrate` creates `data/app.sqlite`.

### Task 0.6 — Database tables

In `packages/shared/src/db/schema.ts`, define every table from spec §10.3. Exact list (use `snake_case` table names):

`projects`, `project_status_history`, `requirement_sessions`, `requirement_scores`, `prd_versions`, `tech_plan_versions`, `acceptance_criteria_versions`, `agents`, `agent_runs`, `events`, `tool_calls`, `diffs`, `human_gates`, `artifacts`, `test_results`, `deployments`, `change_requests`, `commits`.

Rules for a few important tables:
- `events`: columns `event_id` (pk), `seq` (integer), `schema_version`, `project_id`, `run_id` (nullable), `agent_id` (nullable), `correlation_id` (nullable), `timestamp`, `type`, `payload` (JSON text). Add an index on `(project_id, seq)` and make `(project_id, seq)` unique.
- `projects`: include `id` (pk), `name`, `slug`, `status`, `created_at`, `updated_at`.
- `human_gates`: `id` (pk), `project_id`, `gate_type`, `status` (`open`/`resolved`), `options` (JSON), `decision` (nullable), `created_at`, `resolved_at`.

Verify: `pnpm migrate` re-runs clean and all 18 tables exist (open the DB and list tables).

### Task 0.7 — Shared types + zod schemas

In `packages/shared/src`, create zod schemas AND inferred TypeScript types for:
- `EventEnvelope` and the `AgentEvent` payload union — copy member shapes exactly from spec §8.1.
- `RequirementState` — copy fields exactly from spec §4.2 (include `completenessThreshold`, `maxQuestionRounds`, per-round `scoreAfter`).
- `DevState` — copy fields exactly from spec §5.2 (include `maxSliceAttempts`, `currentSliceAttempts`).
- `AgentDefinition` — copy from spec §7.
- `ProjectStatus` — a zod enum with the 12 states from spec §3.1.
- `STATUS_TRANSITIONS` — a constant map from each status to its allowed next statuses, copied from the transition table in spec §3.1 (and README).

Export everything from `packages/shared/src/index.ts`.

Verify: `pnpm --filter @oc/shared typecheck` passes; `import { EventEnvelope } from "@oc/shared"` works from `apps/api`.

### Task 0.8 — M0 test baseline backfill

Because M0 may already be implemented, this is a backfill task rather than a strict red/green implementation task. Add tests that prove the foundation works:

- Root script smoke: `pnpm -w typecheck` and `pnpm -w test` are runnable from the root.
- Migration smoke: migrations create `data/app.sqlite` and all 18 MVP tables.
- Shared schema tests: valid `EventEnvelope`, `RequirementState`, `DevState`, `AgentDefinition`, and `ProjectStatus` parse successfully; invalid examples fail.
- Status-transition fixture: `STATUS_TRANSITIONS` includes every status from spec §3.1.
- Cross-package import smoke: `apps/api` and `apps/web` can import from `@oc/shared` without long relative paths.

Verify: `pnpm -w test` runs these baseline tests and passes.

## Verification (run all, all must pass)

```bash
pnpm install
pnpm -w build
pnpm migrate
pnpm -w typecheck
pnpm -w test
# start web, confirm it shows "OneCompany"
# start api, confirm curl localhost:3001/health -> {"ok":true}
```

## Definition of Done

- [ ] `pnpm install` succeeds.
- [ ] `apps/web` starts and shows `OneCompany`.
- [ ] `apps/api` starts and `/health` returns `{ "ok": true }`.
- [ ] All five packages build.
- [ ] `pnpm migrate` creates `data/app.sqlite` with all 18 tables from §10.3.
- [ ] `packages/shared` exports zod schemas + types for `EventEnvelope`, `AgentEvent`, `RequirementState`, `DevState`, `AgentDefinition`, `ProjectStatus`, `STATUS_TRANSITIONS`.
- [ ] Both apps can import from `@oc/shared`.
- [ ] M0 baseline tests pass with `pnpm -w test`.

## Do Not

- Do not put business logic in this phase. Only scaffolding, DB, and types.
- Do not define types outside `packages/shared`.
- Do not skip any of the 18 tables, even if a phase does not use them yet.
- Do not rewrite completed M0 work just to satisfy TDD. Backfill tests that lock the current behavior, then continue.

## Output (for later phases)

- A buildable monorepo.
- A migrated SQLite database with all tables.
- Shared schemas/types that every later phase imports from `@oc/shared`.
- Baseline tests that prove M0 is stable before M1 begins.
