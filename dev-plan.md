# OneCompany MVP Development Plan

Based on: `spec.md` / version 0.3.2
Date: 2026-06-08
Audience: implementation team (assumes 1–2 engineers, local-first TypeScript)

## How To Read This Plan

- Work is organized into milestones M0–M12 (M0–M11 are the MVP; M12 is post-MVP). Each milestone is independently demoable and leaves the system in a working state.
- Each milestone lists: goal, tasks, spec references, and a Definition of Done (DoD).
- Effort is a rough relative size (S ≈ 1–3 days, M ≈ 3–6 days, L ≈ 1.5–2.5 weeks) for a small team. Treat as planning hints, not commitments.
- The build order follows `spec.md` §19 but is expanded with dependencies, data, and exit criteria.

## Guiding Principles

- Durable state plus event log. Durable workflow state and task state are the control source for transitions and recovery; the append-only event log (§8) is the audit and UI streaming source. Build both boundaries early.
- Vertical slices over horizontal layers. Prefer thin end-to-end paths (one agent, one event, one panel) before breadth.
- Orchestration boundary (§10.1, L5). LangGraph owns macro workflow, budgets, status transitions, and gates; OpenAI Agents SDK owns single-agent ReAct. Never put status/budget logic inside an agent loop.
- Coding engine behind an adapter (§10.4). The Development group runs on opencode through a swappable `CodingHarness`; opencode actions are governed by the same risk/sandbox/gate/redaction policies and §13 model routing, and the engine never owns budgets, status, or gates.
- External integrations behind a gateway (§10.5). GitHub/Supabase/Vercel/Cloudflare-style connectors are post-MVP and must be registered, allowlisted, risk-graded, logged, and backed by offline Skill Packs (§10.6).
- Unhappy path is a feature. Loop budgets, stuck detection, failure gates, and `Failed`/`Paused` transitions are in scope from the milestone that introduces each loop, not bolted on later.
- Human gates are blocking by design. A gate halts the workflow graph until resolved and is always logged.

## Architecture Build Targets (recap from §10)

```text
apps/web        Next.js control console (Tailwind, shadcn/ui)
apps/api        Hono API + SSE endpoints
packages/agent-core   agent registry, LangGraph workflows, Agents SDK + CodingHarness/opencode, model routing
packages/workflow     requirement + development graph definitions
packages/workspace    project workspace, git, shell, sandbox, file ops, risk grading
packages/integrations Integration Gateway: MCP/native connectors + offline skill packs (post-MVP)
packages/shared       shared types + zod schemas (events, states, status machine)
packages/ui           shared UI components (optional)
data/app.sqlite       local DB (Drizzle ORM)
generated-projects/   per-project repo + artifacts + logs + meta.json
```

## UI Baseline From Figma

Figma file: `OneCompany Console - Claude Style Draft`

URL: https://www.figma.com/design/r1RF1q4KzBEQHLBWVhGD0X

Reference frames:

- `OneCompany Console / Stream Mode`
- `OneCompany Console / Swimlane Mode`
- `OneCompany Console / Settings Modal`
- `OneCompany Console / Project Hub Modal`
- `Claude-inspired Style Tokens`

Implementation must follow this baseline for the MVP console's structure and visual tone:

- Top nav plus lower left/right split.
- Claude-inspired warm console palette.
- Left panel default Stream Mode with user messages, agent events, inline gates, and sticky user composer.
- Left panel Swimlane Mode over the same projection.
- Right panel exactly five tabs: Files, Preview (with a preview-health indicator), Terminal, Tests (per-check rows + failing trace; per-slice checks separate from the final suite), Report.
- Avatar dropdown opens Settings for global environment/secrets/readiness only.
- Project switcher opens Project Hub for multi-project management, including the 9-stage lifecycle timeline (Draft → Asking → PRD → Tech plan → Developing → Testing → Deploy → Acceptance → Delivered).

## Milestone Overview

| ID | Milestone | Depends on | Effort | Exit demo |
| --- | --- | --- | --- | --- |
| M0 | Foundations & repo setup | — | M | App boots, DB migrates, types shared |
| M1 | Event log + SSE + status machine + gate foundation | M0 | M | Create project, stream events, drive transitions, persist a blocking gate |
| M2 | Agent registry + orchestration skeleton | M1 | M | Dummy agent runs a node, emits P/A/O/R + error events; CodingHarness stub in place |
| M3 | Requirement workflow | M2 | L | One sentence → Q&A loop (with budget) → PRD + acceptance |
| M4 | Human gate UI + gate policies | M1 | M | Gate cards render; decisions logged; allowed actions enforced |
| M5 | Workspace, git, shell, sandbox | M0 | L | Safe command exec, git per-slice, sandbox high-risk |
| M6 | Development workflow (TDD loop, opencode) | M3, M4, M5 | L | Tech plan → governed opencode TDD slice loop → committed code |
| M7 | Testing & QA integration + local preview | M5, M6 | M | Preview reachable; per-slice checks + final acceptance suite surfaced |
| M8 | Right panel tabs | M1, M5, M7 | M | Files / Preview / Terminal / Tests / Report functional |
| M9 | Info stream + swimlane renderers | M1, M2 | M | Both renderers over one event stream |
| M10 | Deployment, delivery, change requests | M4, M6, M7, M8 | L | Deploy gate + tunnel + delivery report + change flow |
| M11 | Hardening & MVP acceptance | all | M | §18 acceptance checklist passes |
| M12 | Integration Gateway + offline Skill Packs | M11 | L | GitHub/Supabase/Vercel-style connectors registered with offline fallbacks |

Critical path: M0 → M1 → M2 → M3 → M4 → M6 → M7 → M10 → M11. M5 (L) depends only on M0 but also hard-blocks M6, so it is co-critical: start it as early as M1, and if it slips it lands on the critical path.
Parallelizable once M1 lands: M5 (workspace) alongside M2/M3/M4; M9 (renderers) alongside M4–M8; M8 tabs as their backing services come online.
M12 (Integration Gateway + offline Skill Packs) is post-MVP: it starts only after M11 and is not on the MVP critical path.

---

## M0 — Foundations & Repo Setup

Goal: a working monorepo with shared types and a migrated database, no features yet.

Tasks:
- Monorepo tooling (pnpm workspaces + Turborepo or equivalent), root TS config, ESLint, Prettier, Vitest config. [M]
- Scaffold `apps/web` (Next.js + Tailwind + shadcn/ui) and `apps/api` (Hono). [S]
- Scaffold `packages/{shared,agent-core,workflow,workspace,ui}`. [S]
- Drizzle ORM + SQLite at `data/app.sqlite`; migration runner. [S]
- Implement the MVP §10.3 tables as Drizzle schema, including `tech_plan_versions`, `acceptance_criteria_versions`, `diffs` (the post-MVP integration tables land in M12). [M]
- `packages/shared`: zod schemas + TS types for `EventEnvelope` + `AgentEvent` (§8.1), `RequirementState` (§4.2), `DevState` (§5.2), `AgentDefinition` (§7), and the project status enum + transition map (§3.1). [M]

Spec refs: §10.1, §10.2, §10.3, §3.1, §4.2, §5.2, §7, §8.1.

DoD: `apps/web` and `apps/api` start locally; `pnpm migrate` creates every table; shared types/schemas import cleanly from both apps.

## M1 — Event Log + SSE + Status Machine + Gate Foundation

Goal: the durable-state/event backbone, reusable status machine, and minimal blocking-gate primitive.

Tasks:
- Append-only event log writer over the `events` table; typed `emit(envelope)` API with `eventId`, per-project `seq`, `schemaVersion`, timestamp, and correlation metadata. [M]
- Project CRUD + `project.created` and `project.status_changed` events; `project_status_history`. [S]
- Status machine engine implementing §3.1 states + transition table, including `Paused` (enter/resume) and `Failed`. Reject illegal transitions. [M]
- SSE endpoint in `apps/api` streaming events per project; reconnect/replay from last event id. [M]
- Minimal gate foundation: create/resolve gate records, emit `human_gate.created/resolved`, and expose an API for workflows to block and resume. Full card UI and per-gate action policy land in M4. [M]
- Minimal web client that subscribes and logs raw events (throwaway UI). [S]

Spec refs: §8, §3.1, §10.3.

DoD: creating a project emits enveloped events over SSE; status transitions are validated by the engine and persisted to history; illegal transitions are rejected; a workflow can create a blocking gate and resume after an API decision.

## M2 — Agent Registry + Orchestration Skeleton

Goal: prove the LangGraph + Agents SDK boundary with a no-op agent.

Tasks:
- Agent registry: register/resolve `agentId@version`, store in `agents` table; workflow refs by id+version (§7). [M]
- LangGraph macro-workflow harness: nodes, durable state, budget hooks, gate-node placeholder. [M]
- OpenAI Agents SDK single-agent executor invoked inside a node; emits `agent.started`, `agent.plan/act/observe/reflect`, `agent.error`, `run.failed`; writes `agent_runs`. [M]
- Internal model routing policy (cheap/standard/strong) per §13, not user-configurable. [S]
- Tool-call plumbing: `tool_call.started/output/failed` events. [S]
- `CodingHarness` interface (`runSlice` + `authorize`) plus a test stub; the Development group binds to `OpencodeHarness` in M6. Budgets/status/gates stay out of the harness (§10.4). [S]

Spec refs: §7, §10.1 (orchestration boundary, L5), §10.4, §13, §8.1, §14.4.

DoD: a dummy agent runs through one LangGraph node, produces the full P/A/O/R event sequence, and a forced failure produces `agent.error` + `run.failed`.

## M3 — Requirement Workflow

Goal: turn a one-sentence requirement into a confirmed PRD + acceptance criteria, with a terminating loop.

Tasks:
- Implement requirement agents: Intake, Requirement Analyst, Completeness Scorer (0–100), Question Planner (≤10 questions/round), PRD And Acceptance (§4.1). [L]
- Durable `RequirementState` with `completenessThreshold` (85), `maxQuestionRounds` (6), per-round `scoreAfter` (§4.2). [M]
- Requirement loop graph (§4.3): score → question round → re-score, gated by round budget. [M]
- Loop termination (H1): round-budget exhaustion + stuck detection (<3 pts over 2 rounds) → raise Requirement Stuck gate through the M1 gate foundation. [M]
- Persist `requirement_sessions`, `requirement_scores`, `prd_versions`, `acceptance_criteria_versions`. [S]

Spec refs: §4, §3 (Asking Questions ⇄ scoring), §10.3.

DoD: a vague input drives one or more question rounds and produces a versioned PRD + acceptance criteria; the loop provably stops via budget/stuck and surfaces a blocking stuck gate instead of looping forever. The gate may be resolved through the API until the M4 card UI lands.

## M4 — Human Gate UI + Gate Policies

Goal: user-facing human-in-the-loop cards with correct per-gate actions.

Tasks:
- Gate type registry: requirement confirm, tech plan confirm, requirement stuck, slice failure, change review, deployment, dangerous operation, final acceptance (§6). [M]
- Per-gate action policy (L4): "Skip risk and continue" only for low/medium operation gates; scoped options for stuck/failure/change gates. [S]
- Minimal app shell for gate cards if the full M9 layout is not ready yet. [S]
- Frontend gate cards: option tabs + custom input; resolution posts decision and resumes blocked workflow. [M]
- Prepare `GateCard` so it can render inline inside the Stream Mode feed and share its custom-input path with the sticky Stream composer when M9 lands. [S]

Spec refs: §6, §8.1, §8.2 (decisions retained).

DoD: each gate type renders a card, enforces allowed actions, resumes the blocked workflow after resolution, records the decision in the event log, and can be embedded in the Stream Mode feed without changing gate policy.

## M5 — Workspace, Git, Shell, Sandbox

Goal: safe execution substrate for generated projects.

Tasks:
- Project workspace layout under `generated-projects/{slug}` with `meta.json`, `artifacts/`, `logs/` (§10.2, §11). [S]
- Git service: init per project, per-slice commit, link commit → task id/tests/summary; `commits` table (§11). [M]
- Shell execution service with risk grading (§12): Low/Medium/Medium-constrained/High/High-deploy. Capture all command output through the redaction/chunking pipeline (§8.2). [L]
- Log retention pipeline: redact secrets before persistence; chunk large command outputs into `logs/` or `artifacts/`; store DB metadata such as path, byte length, hash, and summary. [M]
- Dependency-install handling (M4/R2 of spec): `npm ci --ignore-scripts` + committed lockfile + pinned registry, or explicitly allowlisted lifecycle scripts, is Medium-constrained; otherwise High. [S]
- Docker sandbox for containable high-risk ops; deploy/tunnel run on real workspace/network, not sandbox (M5 of spec). [M]
- High-risk ops raise the dangerous-operation gate (from M4). [S]

Spec refs: §11, §12, §8.2.

DoD: low/medium commands run locally and are logged after redaction; constrained dependency installs cannot run unreviewed lifecycle scripts; a containable high-risk command runs in Docker after confirmation; deploy/tunnel are gated but not sandboxed; every command's output is retained through DB metadata plus artifact chunks.

## M6 — Development Workflow (Plan + ReAct + TDD)

Goal: from confirmed PRD to committed code via the function-slice loop, running on the opencode engine.

Tasks:
- Dev agents: Architect, Test Designer, Planner, Coding, Review, QA, DevOps & Delivery (§5.1). [L]
- `OpencodeHarness`: start/stop a local per-project opencode server (`opencode serve` / `createOpencodeServer()`, loopback, per-project port, optional password) pointed at `generated-projects/{slug}/repo`; pin the opencode version (§10.4, O2). [M]
- Three governance bridges (O3): event bridge (opencode SSE → `EventEnvelope`/`AgentEvent`), permission bridge (`permission.asked` → §12 risk grading/sandbox/gate, answered via opencode's permission API), log bridge (→ §8.2 redaction/chunking) (§10.4, §12). [L]
- Model/credentials (O5): pass the §13-selected provider+model into each opencode session using OneCompany-managed keys; disable opencode login/Zen paths (§13). [S]
- `DevState` with function-slice task queue, `maxSliceAttempts` (4), `currentSliceAttempts` (§5.2). [M]
- Tech plan generation + versioning (`tech_plan_versions`) + Tech Plan Review gate; reject → replan (§3, §5). [M]
- Per-slice loop: opencode runs the intra-slice TDD loop (Plan → failing tests → implement → run → fix); OneCompany then runs the authoritative scoped test at the slice boundary via a structured reporter (e.g. `vitest --reporter=json`) to drive the transition and the Tests/stream status, then commits (§5.3, §10.4, O4). [L]
- Loop termination (H1/R4): retry-budget exhaustion → Slice Failure gate (retry/replan/request skip/fail). Skip requests route through Change Review instead of silently waiving a feature. [M]
- Diff capture: `diffs` table + `diff.created` events (§8.1). [S]

Spec refs: §5, §3.1 (Developing transitions), §10.3, §10.4, §12, §13.

DoD: a confirmed PRD produces a tech plan (gated), then function slices that each write failing tests, implement, pass scoped checks, and commit; an unfixable slice surfaces the Slice Failure gate, and skip requests enter Change Review; opencode runs under the permission bridge (no ungoverned shell/edit) and each slice's authoritative pass/fail comes from OneCompany's own scoped test run.

## M7 — Testing & QA Integration + Local Preview

Goal: real test execution and local preview verification, with per-slice vs final-suite separation.

Tasks:
- Runners: Vitest (unit/integration), TypeScript typecheck, build, Playwright E2E (§15). [M]
- Local preview server lifecycle for generated apps; store preview URL in project state and emit relevant events. [M]
- Per-slice scoped checks vs final full acceptance suite as distinct phases (§5.5, H3); `Testing` failure → `Developing`. [M]
- `test_results` table + `test.result` events; Playwright screenshots/traces stored as artifacts. [S]
- QA agent consumes results, requests fixes, and verifies reachability of the preview (§15). [M]

Spec refs: §15, §5.5, §3.1 (Testing transitions).

DoD: the generated app can start a local preview URL; per-slice checks run inside the dev loop; after all slices, the full suite runs as the `Testing` phase against the preview where needed; failures route back to `Developing`; results are queryable and event-streamed.

## M8 — Right Panel Tabs

Goal: the five MVP tabs (§14.5), wired to backing services.

Tasks:
- Implement the Figma-baseline tab shell with exactly five tabs and compact Claude-style surface treatment. [S]
- Files: tree for generated source + artifacts, file content view, diff view (read-only; no in-viewer editing per §2.3). [M]
- Preview: browser-like preview surface embedding local preview URL from M7 and deployment URL when available; show a preview-health indicator (reachable / Playwright ready / console-error count) (§16, §14.5). [S]
- Terminal: free terminal whose output is captured to logs and subject to risk grading (§14.5, L3). [M]
- Tests: render unit/integration/typecheck/build/E2E/acceptance results as per-check rows with pass/fail/pending status, a failing check's trace + suggested fix, and artifact links; keep per-slice checks visibly separate from the final suite (§15 backing from M7, §14.5). [S]
- Report: PRD, acceptance cases, run instructions, delivery report, risks, deployment/preview URL, and final acceptance summary (§17). [S]

Spec refs: §14.5, §2.3, §16, §17.

DoD: all five tabs function against live data, match the Figma information hierarchy, and the terminal is governed (logged + risk-graded), not a bypass.

## M9 — Info Stream + Swimlane Renderers

Goal: two renderers over one event source (§14.3, §14.4).

Tasks:
- Implement shared Claude-inspired style tokens from the Figma baseline: warm surfaces, dark ink text, copper/orange accent, muted warm borders, success/warning/danger states (§14.8). [S]
- Top nav (visual option 2): project switcher, coherent status/phase/active-group/progress pills, run/pause, deploy entry, avatar dropdown w/ settings (§14.2). [M]
- Project Hub modal from the project switcher: project search/filter/list, selected-project metrics, a 9-stage lifecycle timeline (Draft→Asking→PRD→Tech plan→Developing→Testing→Deploy→Acceptance→Delivered) with a current-stage marker, open gate summary, preview/deploy summary, artifacts, Open/Pause/Archive/New Project actions; compact dropdown and full Hub are mutually exclusive (§14.7). [M]
- Settings modal from the avatar dropdown: workspace paths, API key/secret readiness, Cloudflare Tunnel configuration, environment checks, and read-only policy chips; exclude project management, model routing, sandbox policy, and shell-risk configuration (§14.6). [M]
- Layout shell: top nav + resizable left/right split, default 42–46% / 54–58% (§14.1). [S]
- Information stream renderer (Opencode/Claude-Code-style contract, §14.3.1): real-time SSE-appended feed (newest at bottom, pin-to-bottom auto-scroll); runs grouped by `runId`/`agentId`/`correlationId`; Plan/Act/Observe/Reflect segments with the active one expanded and completed ones collapsed; tool-call rows expandable to args/result with large output folded to artifact links (R5); streamed + secret-redacted command output with "open in Terminal"; inline diff/test chips linking to Files/Tests; explicit user vs agent vs gate styling with the raw user input preserved separately from the normalized summary; inline gate cards showing only allowed options (custom text binds to an allowed decision, never implicit approval), at most one blocking gate emphasized and past gates collapsed to resolved chips; sticky context-aware composer. Engine-agnostic over the normalized event stream (§14.3, §14.3.1, §8). [M]
- Swimlane renderer: agent rows × Plan/Act/Observe/Reflect; failed/retry cells driven by `agent.error`/`run.failed`/`tool_call.failed`; user and gate events represented as compact cells/markers from the same projection (§14.4, M2 of spec). [M]
- Shared selectors so both renderers read the same event projection plus current durable state snapshot — no separate UI state systems (§8, §14.4). [S]

Spec refs: §14.1–§14.8, §8, §20.

DoD: switching stream ↔ swimlane shows the same underlying events and current state snapshot; user messages and gates remain visible in both renderers; pause/run control reflects status; Settings and Project Hub open from the correct nav entries; no duplicated UI state store; the stream follows the §14.3.1 contract (P/A/O/R run grouping, large output folded to artifact links, single emphasized blocking gate, raw user input shown separately from the normalized summary).

## M10 — Deployment, Delivery, Change Requests

Goal: expose the app, produce the delivery package, and handle changes.

Tasks:
- Cloudflare Tunnel handoff: user-provided/run tunnel; deployment gate before exposing URL; `deployments` table (§16). [M]
- Delivery report generator covering all §17 sections, including forced-continue decisions, approved acceptance-scope changes from skip-slice requests, and skip-risk risks; write artifacts to `artifacts/`. [M]
- Change request flow (§5.4): `change_requests` + `change_request.created/resolved` events + `Change Review` state; route to `Developing` or `Tech Plan Review` by impact (M1 of spec). [L]
- Secrets policy: no API keys in logs; missing key → mock data + prompt (§12). [S]

Spec refs: §16, §17, §5.4, §3.1 (Change Review, Deploying), §12.

DoD: a passing project can deploy behind a confirmation gate, emits a complete delivery report, and a mid-development change request routes through `Change Review` and updates the plan.

## M11 — Hardening & MVP Acceptance

Goal: meet every §18 acceptance criterion.

Tasks:
- Walk the §18 checklist end-to-end on a real sample app; fix gaps. [M]
- Verify the Figma UI baseline: Stream user cards/composer, Swimlane same-projection rendering, five right tabs, avatar Settings, project-switcher Project Hub, and Claude-inspired console tokens (§14). [S]
- Verify logging completeness and safety (§8.2): tool calls, command + terminal output, diffs, test results, deploy logs, gate decisions, failures, change requests, redaction, and large-output artifact chunking. [S]
- Verify all terminal/`Failed`/`Paused` transitions are reachable (§3.1). [S]
- Regression pass on risk grading + sandbox boundaries (§12). [S]

Spec refs: §18, §14, §8.2, §3.1, §12.

DoD: the §18 acceptance mapping below is fully green.

## M12 — Integration Gateway + Offline Skill Packs (Post-MVP)

Goal: connect OneCompany to external developer services without compromising local-first, governance, or offline operation.

Tasks:
- Add the deferred shared types (`IntegrationDefinition`, `IntegrationConnection`, `SkillPack`) and the five integration tables migration (`integration_definitions`, `integration_connections`, `integration_tool_calls`, `skill_packs`, `skill_pack_runs`) — intentionally not built in M0/M2 (§10.3, §10.5, §10.6). [S]
- `packages/integrations`: implement the Integration Gateway registry, connection state, and normalized tool-call adapter over MCP/native providers (§10.5). [M]
- Connector definitions for P1/P2 connectors with allowlisted tools, project-scoped permissions, risk labels, and secret refs; no arbitrary unregistered MCP servers. P1: Playwright/Browser, Figma, GitHub, Supabase, Vercel. P2: Cloudflare, Linear/Jira, Sentry/PostHog, Documentation/Context, Postgres/Database, Docker/Container. [M]
- Connector governance: external writes route through §12 risk grading and human gates; all outputs pass §8.2 redaction/chunking and event logging. [M]
- Offline Skill Packs for each P1 connector and selected P2 connectors, each with `SKILL.md`, recipes, templates, scripts, tests, and manual runbooks (§10.6). [M]
- Integrations UI: readiness/status surface showing connected, expired, disabled, or offline fallback; detailed configuration lives outside Project Hub. [S]

Recommended order:
1. Playwright / Browser: generated app preview verification, user-click acceptance, screenshots, console errors, traces.
2. Figma: design baseline, design-to-code context, design handoff.
3. GitHub: local git -> remote repo/branch/PR handoff.
4. Supabase: dev database/schema/auth/storage support, with production writes gated.
5. Vercel: preview deployments/logs/env vars/domains, with deploy/env/domain changes gated.
6. Cloudflare expansion beyond MVP tunnel: Pages/Workers/D1/R2/KV.
7. Linear/Jira + Sentry/PostHog/observability.
8. Documentation/Context, Postgres/Database, Docker/Container.
9. Stripe, collaboration connectors, and Kubernetes/cloud infrastructure only after stricter safety work.

Spec refs: §10.5, §10.6, §12, §8.2, §14.6, §16.

DoD: each connector can run in online mode with allowlisted audited tool calls, and in offline mode with a Skill Pack that produces honest local artifacts and manual follow-up instructions without faking remote success.

---

## Cross-Cutting Workstreams

- Platform self-testing: unit tests for the status-machine engine and budget/stuck logic; integration tests for the requirement and dev graphs; an E2E "golden path" that drives a tiny app from one sentence to delivery. Start in M1 and grow each milestone.
- Observability: every milestone that adds a flow must add its events to the log and ensure they render in the info stream (M9) — no silent state.
- Schema discipline: all event/state shapes live in `packages/shared` as zod schemas; DB writes validate against them.
- Integration governance: external connector tools, opencode tools, and local shell tools all use the same event/log/redaction/risk/gate path. No connector-specific bypass.

## MVP Acceptance Mapping (§18 → milestone)

| §18 criterion | Milestone |
| --- | --- |
| Create project from a simple requirement | M1, M3 |
| Requirement analysis, scoring, gap questioning, PRD | M3 |
| Requirement loop terminates + stuck gate | M3, M4 |
| Human confirm requirement + tech plan via cards | M4, M6 |
| Console matches Figma UI baseline: top nav, Stream user cards/composer, Swimlane, five tabs, Settings, Project Hub | M8, M9 |
| Dev group implements slices, records events | M2, M6 |
| Dev group runs on opencode under full governance + authoritative test status | M6, M5, M7 |
| Per-slice retry budget + slice failure gate | M6, M4 |
| Tests generated/run; per-slice + final suite | M7 |
| Generated app previewable + Playwright verifies preview URL | M7, M8 |
| Dockerfile/Compose + run instructions generated | M6, M10 |
| Delivery report complete | M10 |
| High-risk ops require confirmation + logged | M4, M5 |
| Command logs redacted + large output chunked | M5, M11 |
| `Failed` and `Paused` reachable | M1, M3, M6 |
| Final acceptance captured | M4, M10 |
| No unresolved high-risk issue | M11 |

## Post-MVP Integration Acceptance Mapping

| Criterion | Milestone |
| --- | --- |
| Integration definitions and connection state are registered, versioned, and project scoped | M2, M12 |
| GitHub connector supports repo/branch/PR handoff with audited writes | M12 |
| Supabase connector supports dev schema/data workflows with production writes gated | M12 |
| Vercel connector supports preview deploy/log/env workflows with deploy/env/domain changes gated | M12 |
| Cloudflare connector expands beyond tunnel without bypassing deployment gates | M12 |
| Offline mode falls back to Skill Packs and never fakes remote success | M12 |

## Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| LangGraph / Agents SDK boundary blurs (budgets leak into agents) | Non-deterministic loops | Enforce in M2; budgets/transitions only in graph nodes; lint/review rule |
| Event schema churn after renderers exist | Rework in M9 | Freeze `EventEnvelope` + `AgentEvent` shapes in M0/shared; version events if needed |
| Command logs leak secrets or overload SQLite | Security and stability issue | Redact before persistence; chunk large output into artifacts; DB stores metadata and hashes |
| Dependency lifecycle scripts execute unexpectedly | Supply-chain risk | `npm ci --ignore-scripts` by default; scripts require allowlist or high-risk confirmation/sandbox |
| Docker sandbox availability on user machines | High-risk ops can't run | Detect Docker at startup (env check in settings, §14.2); degrade to gated-local with explicit risk |
| Generated-app stack variety explodes scope | Slips M6/M7 | MVP supports only the default stack (§10.1); others are future scope |
| Cloudflare Tunnel friction | M10 slips | MVP only requires user-provided tunnel; token automation is future (§16) |
| LLM nondeterminism breaks E2E golden path | Flaky acceptance | Pin models/seeds where possible; assert on structure/events, not exact text |
| opencode upstream API/CLI churn | Adapter breakage | Pin opencode version behind `CodingHarness`; integration-test the adapter; keep one real harness + a stub |
| opencode bypasses governance (shell/edit without asking) | Security/policy hole | Force permission-ask mode; route every `permission.asked` through §12; deny-by-default; no auto-approve for high risk |
| opencode self-reports tests as passing | False-green slices | Authoritative pass/fail from OneCompany's own scoped test run (O4); opencode test runs are informational only |
| opencode uses its own model/keys/Zen path | Routing, cost, credential drift | Pass §13 provider+model per session with managed keys; disable opencode login/Zen (O5) |
| External connector bypasses governance | Unlogged production writes or deploys | Integration Gateway normalizes all connector tools into `tool_call.*`, §12 risk grading, and human gates |
| Remote MCP resource contains prompt injection | Policy override or data leak | Treat connector resources as untrusted data; never let remote text override system policy, tool allowlists, or gates |
| Offline mode overclaims remote effects | False delivery report | Skill Packs produce local artifacts and manual follow-up only; delivery report lists unperformed remote steps |
| Connector secret leaks | Security incident | Store only secret refs in definitions; redact before DB/artifacts/frontend; connection status never reveals values |

## Suggested First Two-Week Slice

A concrete starting increment that yields a visible end-to-end skeleton:

1. M0 fully (repo, DB, shared types).
2. M1 fully (event log, SSE, status machine, gate foundation).
3. M2 happy path (dummy agent emits P/A/O/R over SSE).
4. M9 partial: layout shell + information stream rendering the dummy agent's events.

Outcome: create a project in the UI, watch a (stub) agent's plan/act/observe/reflect stream into the information panel, with status transitions persisted — the spine everything else hangs off.
