# OneCompany Build Handbook

This handbook tells you, the AI developer, exactly how to build OneCompany, one phase at a time.

Source of truth: `spec_0.2.md` (the product/architecture spec) and `dev-plan.md` (the milestone plan).
This handbook turns those into small, ordered steps you can follow without guessing.

If the handbook and the spec ever disagree, the spec wins. When unsure, re-read the spec section named in the phase doc. Do not invent behavior.

## Who This Is For

You are a coding agent. You may not remember earlier steps. That is fine. Each phase doc is self-contained. Read the whole phase doc before writing code. Then do the tasks in order.

## How To Use This Handbook

1. Find the lowest-numbered phase that is not done yet. Phases must be done in order (M0 first).
2. Open that phase doc and read it fully.
3. Do the tasks in the listed order. Do one task at a time.
4. After each task, run its verify command. If it fails, fix it before moving on.
5. When all tasks pass, check every box in the phase's Definition of Done.
6. Only then move to the next phase.

## The 12 Golden Rules (never break these)

1. Do tasks in order. Do not skip ahead.
2. One task at a time. Finish and verify before starting the next.
3. After writing code, always run the verify command for that task.
4. Never leave the code in a broken state. If a check fails, fix it now.
5. All shared types and zod schemas live in `packages/shared`. Import them; never redefine them.
6. Every persisted event uses the `EventEnvelope` shape (see Glossary). Never write a bare event.
7. Status changes go only through the status-machine module. Never set status by hand.
8. Loop limits (question rounds, slice retries) and status transitions live in LangGraph nodes, never inside an agent's own reasoning loop.
9. Never write secrets (API keys, tokens) into logs, the database, the event stream, or artifacts. Redact first.
10. Never run a high-risk command without a human gate. See the Risk Grading table in `spec_0.2.md` §12.
11. Do not add features that are not in the current phase. Stay in scope.
12. If you get stuck, follow "If You Get Stuck" below. Do not guess or invent APIs.

## The Per-Task Loop (do this for every task)

```text
1. READ the task and the spec section it points to.
2. PLAN in one sentence what file you will change and what it must do.
3. WRITE the code in the exact file path given.
4. RUN the verify command in the task.
5. If it FAILS -> read the error, fix, run again. Repeat until green.
6. If it PASSES -> move to the next task.
```

## If You Get Stuck

- Re-read the spec section named in the task. The answer is usually there.
- If a value is not specified, use the default written in the spec (for example: threshold 85, max question rounds 6, max slice attempts 4).
- If two instructions conflict, the spec wins, then this handbook, then your own judgment.
- If you cannot make a check pass after 3 honest tries, stop. Write a short note in `handbook/BLOCKERS.md` describing: the phase, the task, the command, the error, and what you tried. Then continue with the next independent task if one exists.
- Never delete tests to make checks pass. Never hardcode fake results.

## Repository Conventions

- Language: TypeScript everywhere. `strict` mode on. No `any` unless unavoidable (and then add a comment why).
- Package manager: `pnpm`. Monorepo via pnpm workspaces + Turborepo.
- Node: version 20 or newer.
- Validation: `zod` schemas in `packages/shared`. Validate all external input and all DB writes against schemas.
- Database: SQLite at `data/app.sqlite`, accessed only through Drizzle ORM.
- Naming: files `kebab-case.ts`; types/classes `PascalCase`; variables/functions `camelCase`; DB tables `snake_case`.
- Imports: use workspace package names (for example `@oc/shared`), not long relative paths across packages.
- Tests: `Vitest` for unit/integration, `Playwright` for browser. Test files end in `.test.ts` or `.spec.ts`.
- Every package builds and type-checks on its own.

## Target Repository Layout (from spec §10.2)

```text
apps/
  web/                 # Next.js control console (Tailwind, shadcn/ui)
  api/                 # Hono backend API + SSE endpoints
packages/
  agent-core/          # agent registry, LangGraph workflows, OpenAI Agents SDK integration, model routing
  workflow/            # requirement + development graph definitions
  workspace/           # project workspace, git, shell, sandbox, file ops, risk grading
  shared/              # shared types + zod schemas (events, states, status machine)
  ui/                  # shared UI components (optional)
data/
  app.sqlite           # local SQLite database
generated-projects/
  {projectSlug}/
    repo/              # generated app source
    artifacts/         # PRD, acceptance, reports, screenshots, logs
    logs/
    meta.json
handbook/              # this handbook
```

## Glossary (read once, refer back often)

- Project: one user requirement being turned into an app. Everything is scoped to a `projectId`.
- Status / status machine: the project's lifecycle state (for example `Developing`). Allowed states and moves are fixed in `spec_0.2.md` §3.1 and copied into the table below. Change status only through the status-machine module.
- Durable state: the saved workflow/task state that the system reads to decide what to do next. This is the control source.
- Event: a record of something that happened (for example `agent.plan`). Events are append-only history. They are the audit source and the thing the UI streams. Events do not control the workflow; durable state does. (spec §8, R1)
- EventEnvelope: the required wrapper around every event. Shape:

```ts
type EventEnvelope<TPayload> = {
  eventId: string;
  seq: number;            // increases by 1 per project, in order
  schemaVersion: string;
  projectId: string;
  runId?: string;
  agentId?: string;
  correlationId?: string;
  timestamp: string;      // ISO 8601
  payload: TPayload;      // one of the AgentEvent union members (spec §8.1)
};
```

- SSE: Server-Sent Events. One-way stream from `apps/api` to `apps/web`. Used only to push events to the UI, never for internal coordination (spec §8).
- Projection: a read-only view computed from events plus the current durable-state snapshot. The information stream and swimlane are two projections over the same data (spec §8, §14.4).
- Human gate: a point where the workflow stops and waits for a person to choose an option. Gates are blocking and always logged (spec §6).
- Function slice: a small, testable feature unit, usually one git commit (spec §5.3).
- ReAct loop: an agent's own Plan -> Act -> Observe -> Reflect cycle inside one node.
- Risk grading: how dangerous a shell/tool command is (Low / Medium / Medium-constrained / High / High deploy-network). See spec §12. High needs a gate; containable High runs in the Docker sandbox; deploy/tunnel run on the real machine, not the sandbox.
- Sandbox: a Docker container used to run containable high-risk operations safely (spec §12).

## Status Machine (reference — from spec §3.1)

States: `Draft Requirement`, `Asking Questions`, `PRD Ready`, `Tech Plan Review`, `Developing`, `Change Review`, `Testing`, `Deploying`, `Awaiting Acceptance`, `Delivered` (terminal), `Failed` (terminal), `Paused` (cross-cutting, resumable).

Allowed transitions (only these are legal):

| From | To | Trigger |
| --- | --- | --- |
| Draft Requirement | Asking Questions | Analysis finds gaps or score below threshold |
| Draft Requirement | PRD Ready | Initial analysis: score >= 85 and no critical gap |
| Asking Questions | Asking Questions | Next question round, round budget remains |
| Asking Questions | PRD Ready | Score >= 85 and no critical gap |
| Asking Questions | PRD Ready | Force-continue at Requirement Stuck gate (logged risk) |
| Asking Questions | Failed | Fail chosen at Requirement Stuck gate |
| PRD Ready | Asking Questions | Human rejects requirement |
| PRD Ready | Tech Plan Review | Human confirms requirement |
| Tech Plan Review | Tech Plan Review | Human rejects plan; replan |
| Tech Plan Review | Developing | Human confirms technical plan |
| Developing | Developing | Slice fix loop, retry budget remains |
| Developing | Testing | All slices accepted |
| Developing | Tech Plan Review | Replan chosen at Slice Failure gate |
| Developing | Failed | Fail chosen at Slice Failure gate |
| Developing | Change Review | Change request or skip-slice request raised |
| Change Review | Developing | Impact analyzed; plan updated in place |
| Change Review | Tech Plan Review | Change needs technical-plan revision |
| Testing | Developing | Final acceptance suite fails |
| Testing | Deploying | Suite passes and deployment requested |
| Testing | Awaiting Acceptance | Suite passes and no deployment requested |
| Deploying | Awaiting Acceptance | Deployment confirmed and URL exposed |
| Awaiting Acceptance | Developing | Human rejects final delivery |
| Awaiting Acceptance | Delivered | Human accepts |
| any active state | Paused | User pauses run |
| Paused | previous active state | User resumes run |
| any active state | Failed | Unrecoverable error or human fail decision |

## Key Defaults (memorize)

- Completeness score scale: 0–100. Threshold to leave questioning: 85.
- Max question rounds: 6. Stuck = score gains < 3 points over 2 rounds in a row.
- Questions per round: at most 10, one theme per round.
- Max slice attempts: 4.
- Dependency install default: `npm ci --ignore-scripts` with a committed lockfile and pinned registry (Medium-constrained). Anything else is High.

## UI Baseline (M8/M9)

Figma file: `OneCompany Console - Claude Style Draft` — https://www.figma.com/design/r1RF1q4KzBEQHLBWVhGD0X

Reference frames:

- `OneCompany Console / Stream Mode`
- `OneCompany Console / Swimlane Mode`
- `OneCompany Console / Settings Modal`
- `OneCompany Console / Project Hub Modal`
- `Claude-inspired Style Tokens`

Rules to preserve while implementing:

- Use the Claude-inspired warm console palette from spec §14.8.
- The main layout is top nav plus lower left/right split.
- The left panel defaults to Stream Mode and must show user messages, agent events, inline gates, and a sticky user composer.
- Swimlane Mode is only another renderer over the same projection, not another state store.
- The right panel has exactly five tabs: Files, Preview, Terminal, Tests, Report.
- Settings opens from the avatar and manages only global environment/secrets/readiness.
- Project Hub opens from the project switcher and manages multiple projects.

## How Each Phase Doc Is Structured

Every phase doc has the same sections, in this order:
1. Goal — one or two plain sentences.
2. Prerequisites — what must already be done.
3. Concepts you need — only the ideas needed for this phase.
4. Spec references — sections to read.
5. Tasks — numbered, atomic. Each has: what to do, the file path, and a verify command.
6. Verification — copy-paste commands to prove the phase works.
7. Definition of Done — a checklist. All boxes must be checked.
8. Do not — common mistakes to avoid.
9. Output — what now exists for the next phase to use.

## Phase Index

Do these in order.

| Phase | Doc | Goal | Needs |
| --- | --- | --- | --- |
| M0 | [phase-00-foundations.md](./phase-00-foundations.md) | Monorepo, DB, shared types boot | — |
| M1 | [phase-01-event-log-sse-status.md](./phase-01-event-log-sse-status.md) | Event log + SSE + status machine + gate base | M0 |
| M2 | [phase-02-agent-registry.md](./phase-02-agent-registry.md) | Agent registry + orchestration skeleton | M1 |
| M3 | [phase-03-requirement-workflow.md](./phase-03-requirement-workflow.md) | One sentence -> PRD + acceptance | M2 |
| M4 | [phase-04-human-gate-ui.md](./phase-04-human-gate-ui.md) | Gate cards + per-gate policy | M1 |
| M5 | [phase-05-workspace-git-shell-sandbox.md](./phase-05-workspace-git-shell-sandbox.md) | Safe exec, git, sandbox, logging | M0 |
| M6 | [phase-06-development-workflow.md](./phase-06-development-workflow.md) | Tech plan -> slice loop -> commits | M3, M4, M5 |
| M7 | [phase-07-testing-preview.md](./phase-07-testing-preview.md) | Tests + local preview | M5, M6 |
| M8 | [phase-08-right-panel-tabs.md](./phase-08-right-panel-tabs.md) | Files/Preview/Terminal/Tests/Report | M1, M5, M7 |
| M9 | [phase-09-renderers.md](./phase-09-renderers.md) | Info stream + swimlane | M1, M2 |
| M10 | [phase-10-deployment-delivery.md](./phase-10-deployment-delivery.md) | Deploy + delivery report + change requests | M4, M6, M7, M8 |
| M11 | [phase-11-hardening-acceptance.md](./phase-11-hardening-acceptance.md) | Pass spec §18 acceptance | all |
