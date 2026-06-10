# OneCompany

> Turn a one-sentence requirement into a runnable and deployable web application.

OneCompany is a **local-first, AI-powered multi-agent development platform**. It orchestrates the entire software lifecycle — from requirement gathering through architecture, implementation, testing, preview, and delivery — using specialized AI agents with human oversight at every critical decision point.

## What It Does

Give OneCompany a single sentence like *"Build a TypeScript CLI todo app with vitest tests"*, and it will:

1. **Analyze & Clarify** — AI agents analyze your requirement, score its completeness, and ask focused questions to fill gaps.
2. **Generate PRD** — Produce a structured Product Requirements Document and acceptance criteria.
3. **Plan Architecture** — Design a technical plan with stack recommendation, data model, and TDD strategy.
4. **Implement with TDD** — Break work into testable function slices; for each slice, write failing tests first, then implement.
5. **Test & Verify** — Run authoritative test suites, verify local preview, and surface results in real time.
6. **Deliver** — Generate a complete delivery package: source code, Dockerfile, test scripts, run instructions, and delivery report.

**Every step is governed.** High-risk operations require human confirmation. No action bypasses risk grading, sandbox policies, or audit logging.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        apps/web (Next.js)                           │
│  ┌──────────────────────────┐  ┌──────────────────────────────────┐ │
│  │   Left Panel             │  │   Right Panel                    │ │
│  │   ┌─── Stream Mode ───┐  │  │   Files │ Preview │ Terminal    │ │
│  │   │  User messages    │  │  │   Tests │ Report               │ │
│  │   │  Agent events     │  │  └──────────────────────────────────┘ │
│  │   │  Inline gates     │  │                                       │
│  │   │  Sticky composer  │  │          Top Nav                      │
│  │   └───────────────────┘  │   Project Switcher │ Status │ Run    │
│  │   ┌── Swimlane Mode ──┐  │   Avatar ▸ Settings                  │
│  │   │  Agent × P/A/O/R  │  │   Switcher ▸ Project Hub             │
│  │   └───────────────────┘  │                                       │
│  └──────────────────────────┘                                       │
└─────────────────────────────┬───────────────────────────────────────┘
                              │ SSE / REST
┌─────────────────────────────▼───────────────────────────────────────┐
│                        apps/api (Hono)                               │
│  Projects │ Gates │ Requirement │ Development │ Testing │ Workspace │
└───────┬──────────┬──────────┬──────────────┬─────────────┬─────────┘
        │          │          │              │             │
┌───────▼───┐ ┌────▼────┐ ┌──▼───────────┐ │  ┌──────────▼─────────┐
│ shared    │ │workflow │ │ agent-core   │ │  │ workspace          │
│ Zod schemas│ │requirement│ │Agent registry│  │Git, Shell, Sandbox │
│ DB schema │ │engine   │ │Model routing │ │  │Risk grading        │
│ Status    │ │dev      │ │OpenCode      │ │  │Authorize           │
│ machine   │ │engine   │ │Harness       │ │  │Test runners        │
│ Events    │ │testing  │ │Executor      │ │  │Preview             │
│ Gates     │ │engine   │ │Event bridge  │ │  │Dev scaffold        │
│ Redaction │ │console  │ │Permission br.│ │  │Log pipeline        │
└───────────┘ └─────────┘ └──────┬───────┘ │  └────────────────────┘
                                │          │
                    ┌───────────▼──────────▼──┐
                    │  @opencode-ai/sdk       │
                    │  HTTP Server + Client    │
                    └───────────┬─────────────┘
                                │ 127.0.0.1:41xx
                    ┌───────────▼─────────────┐
                    │  OpenCode Engine         │
                    │  (AI Coding Agent)       │
                    └─────────────────────────┘
```

## Project Lifecycle

OneCompany drives each project through a 9-stage state machine:

```
Draft Requirement
  ↓
Asking Questions  ←──── Loop with budget & stuck detection
  ↓
PRD Ready
  ↓
Tech Plan Review  ←──── Replan if rejected
  ↓
Developing  ←────────── Slice TDD loop with retry budget
  ↓
Testing  ←────────────── Return to Developing on failure
  ↓
Deploying  (optional)
  ↓
Awaiting Acceptance
  ↓
Delivered ✓
```

Cross-cutting states: **Paused** (any active state → resume exactly where left off) and **Failed** (terminal, from unrecoverable error or human decision).

## Golden Path: End-to-End Flow

This section traces a complete project from one sentence to delivered app, showing exactly how each stage connects.

### Overview

```
User: "Build a TypeScript CLI todo app with vitest tests"
  │
  ▼
① Create Project ──→ Draft Requirement
  │
  ▼
② Requirement Loop ──→ Asking Questions
  │   Intake → Analyst → Scorer → Question Planner → User Answers → Scorer → ...
  │   (loop until score ≥ 85 or budget exhausted)
  │
  ▼
③ PRD Generated ──→ PRD Ready                ← saved to DB (prd_versions + acceptance_criteria_versions)
  │
  ▼
④ User: POST /development/start
  │
  ▼
⑤ Architect Agent ──→ Tech Plan Review       ← Gate: tech_plan_confirm
  │                                              User clicks "approve"
  ▼
⑥ Planner Agent ──→ Developing
  │   ┌─ Slice 1: OpenCode TDD → Authoritative Test → Commit
  │   ├─ Slice 2: OpenCode TDD → Authoritative Test → Commit
  │   └─ Slice N: ...
  │
  ▼
⑦ All Slices Done ──→ Testing
  │
  ▼
⑧ Full Suite Pass ──→ Deploying → Awaiting Acceptance → Delivered ✓
```

### Phase 1: Requirement Analysis

**Step 1 — Create project.**
`POST /projects` creates a project in `Draft Requirement` status.

**Step 2 — Start requirement.**
`POST /projects/:id/requirement/start` with a one-sentence requirement triggers three agents in sequence:

| # | Agent | Output |
|---|-------|--------|
| 1 | **Intake** | `normalizedSummary`, `targetUsers`, `userGoals` |
| 2 | **Analyst** | `coreFeatures`, `pagesAndFlows`, `dataObjects`, `rolesAndPermissions` |
| 3 | **Scorer** | `completenessScore` (0–100), `gaps[]` |

**Step 3 — Decision loop** (`decideAndContinue`):

```
Score ≥ 85 and no critical gaps?
  ├─ Yes → run PRD & Acceptance Agent → save to DB → status = "PRD Ready"
  ├─ No, budget left → Question Planner → await user answers → rescore → loop
  └─ No, budget exhausted or stuck (< 3 pts over 2 rounds) → create "Requirement Stuck" Gate
       ├─ "keep answering" → extend budget, continue loop
       ├─ "force_continue" → generate PRD below threshold (logged as risk) → "PRD Ready"
       └─ "fail" → status = "Failed"
```

**Step 4 — PRD generation.**
The PRD & Acceptance Agent produces a markdown PRD and acceptance criteria. These are **persisted** to `prd_versions` and `acceptance_criteria_versions` tables — this is the bridge to the next phase.

### Phase 2: Development

**Step 5 — Start development.**
`POST /projects/:id/development/start` initiates development:

```typescript
// From development/engine.ts
const prd = loadLatestPrd(deps.db, projectId);           // ← reads from prd_versions
const acceptance = loadLatestAcceptance(deps.db, projectId); // ← reads from acceptance_criteria_versions

payload = await runArchitect(deps, payload, { prd: prd.content, acceptance: acceptance.content });
payload = raiseTechPlanGate(deps, payload);  // → creates tech_plan_confirm Gate, blocks
```

The **Architect Agent** receives the PRD and acceptance criteria from the requirement phase and produces a technical plan (stack, architecture, data model, TDD strategy). A `tech_plan_confirm` Gate blocks until the user approves.

**Step 6 — User approves tech plan.**
`POST /gates/:id/resolve` with `decision: "approve"` triggers:

```typescript
// Planner Agent breaks PRD into function slices
let next = await runPlanner(deps, payload);
deps.setStatus(projectId, "Developing", "tech_plan_approved");
return runSliceLoopUntilHalt(deps, next);
```

**Step 7 — Slice TDD loop.**
For each function slice:

```
① OpenCode Harness.runSlice()     ← AI writes code + runs tests via OpenCode
② runAuthoritativeCheck()         ← OneCompany runs vitest --reporter=json independently
③ Passed? → git commit + Review Agent → next slice
④ Failed? → retry (budget: 4 attempts) → exhausted → Slice Failure Gate
     ├─ "retry" → extend budget, retry slice
     ├─ "replan" → back to Tech Plan Review
     ├─ "request_skip_slice" → Change Review (must update PRD/acceptance)
     └─ "fail" → status = "Failed"
```

**Step 8 — All slices complete.**
Status transitions to `Testing` for the full acceptance suite.

### How the Two Phases Connect

```
Requirement Phase                         Development Phase
───────────────                           ─────────────────
RequirementState                          DevState
    │                                         │
    │ savePrdAndAcceptance()                  │ loadLatestPrd()
    ▼                                         ▲
┌──────────────────┐                    ┌──────────────────┐
│ prd_versions     │  ←── Database ───→ │ Read PRD content │
│ acceptance_      │    (shared state)  │ Read acceptance  │
│ criteria_versions│                    └──────────────────┘
└──────────────────┘                          │
    │                                         │
    │ setStatus("PRD Ready")                  │ Guard: status !== "PRD Ready" → throw
    ▼                                         │
┌──────────────────┐                          │
│ projects.status  │  ←── State Machine ─────→│
└──────────────────┘                          │
```

Three connection mechanisms:

1. **Database** — The requirement phase writes PRD + acceptance criteria to `prd_versions` and `acceptance_criteria_versions`; the development phase reads from the same tables. This is the **data handoff**.

2. **State machine** — The project status must be `PRD Ready` before `startDevelopment()` proceeds. The status machine enforces valid transitions and rejects illegal ones. This is the **temporal guard**.

3. **Gates** — Human approval gates (`requirement_confirm`, `tech_plan_confirm`) sit between phases. The user must explicitly approve before the workflow advances. This is the **human checkpoint**.

### API Call Sequence

```
# 1. Create project
POST /projects                          → { id: "abc", status: "Draft Requirement" }

# 2. Start requirement
POST /projects/abc/requirement/start    → { phase: "awaiting_answers", questions: [...], status: "Asking Questions" }

# 3. Submit answers (repeat as needed)
POST /projects/abc/requirement/answers  → { phase: "awaiting_answers", questions: [...], status: "Asking Questions" }
POST /projects/abc/requirement/answers  → { phase: "completed", status: "PRD Ready" }

# 4. Start development
POST /projects/abc/development/start    → { phase: "awaiting_gate", gateType: "tech_plan_confirm", gateId: "gate-1" }

# 5. Approve tech plan
POST /gates/gate-1/resolve              → { status: "resolved", decision: "approve" }
  (triggers Planner → slice loop → returns development status)

# 6. Check development progress
GET /projects/abc/development/status    → { phase: "slicing", state: { taskQueue: [...] } }

# 7. Resolve slice failure gate (if needed)
POST /gates/gate-2/resolve              → { decision: "retry" | "replan" | "request_skip_slice" | "fail" }
```

## Agent System

### Requirement Agents

| Agent | Role |
|-------|------|
| Intake | Normalize raw input, identify app type and missing context |
| Requirement Analyst | Extract functional requirements, roles, pages, data objects |
| Completeness Scorer | Score 0–100 and identify critical gaps |
| Question Planner | Generate focused question rounds (≤10 questions/round) |
| PRD & Acceptance | Produce PRD, acceptance criteria, assumptions, and risks |

### Development Agents

| Agent | Role |
|-------|------|
| Architect | Produce technical plan, architecture, stack, data model |
| Test Designer | Convert acceptance criteria into test cases |
| Planner | Break work into function slices |
| Coding | Implement code via OpenCode under governed TDD loop |
| Review | Review diffs, architecture, security, missing tests |
| QA | Run tests, inspect logs, verify browser behavior |
| DevOps & Delivery | Produce Dockerfile, run instructions, delivery report |

### Orchestration Boundary

OneCompany enforces a strict separation between macro and micro orchestration:

- **Macro workflow** (LangGraph): project phases, loop budgets, status transitions, human gates, retry policies. Never inside an agent.
- **Micro execution** (OpenCode / OpenAI Agents SDK): single-agent ReAct reasoning, tool calls, code generation. Agents report outcomes; LangGraph decides transitions.

## Governance & Safety

### Risk Grading

Every shell/edit operation is classified before execution:

| Risk | Examples | Handling |
|------|----------|----------|
| **Low** | `ls`, `cat`, `npm test`, `git status` | Run locally, log |
| **Medium** | File generation, DB init, starting services | Run locally, log |
| **Medium (constrained)** | `npm ci --ignore-scripts` with lockfile | Run locally, network limited |
| **High** | `rm -rf`, unknown scripts, arbitrary `npm install` | Human confirmation + Docker sandbox |
| **High (deploy)** | Deploy, tunnel, production mutation | Human confirmation, real network |

### OpenCode Permission Bridge

OpenCode is configured to **ask before every shell/edit action** (`edit: "ask"`, `bash: "ask"`). Each request flows through:

```
OpenCode permission.asked
  → Permission Bridge → classifyToolOp → risk grading
    → Low/Medium → auto-approve → reply "once"
    → High → create Gate → wait for human decision
      → Approved → reply "once"
      → Rejected → reply "reject"
```

No action ever bypasses governance. There is no `"always"` auto-approve.

### Authoritative Testing

OpenCode's self-reported test results are informational only. **OneCompany runs its own authoritative tests** at each slice boundary using `vitest --reporter=json`, and those results drive state transitions and the Tests tab.

### Secret Redaction

All command output, tool results, and logs pass through automatic secret detection and redaction before persistence or display. Large outputs are chunked into artifact files; the database stores only metadata and hashes.

## Human Gates

Eight gate types ensure human control at critical moments:

| Gate | When |
|------|------|
| Requirement Confirm | Before development starts |
| Tech Plan Confirm | Before coding begins |
| Requirement Stuck | Question budget exhausted or loop stuck |
| Slice Failure | Retry budget exhausted for a function slice |
| Change Review | User modifies requirement mid-development |
| Deployment | Before exposing a URL |
| Dangerous Operation | High-risk command or file operation |
| Final Acceptance | Before marking Delivered |

Each gate enforces an action policy — e.g., "Skip risk and continue" is only available for low/medium gates, never for deployment or final acceptance.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js, React, Tailwind CSS, shadcn/ui |
| Backend API | Hono (TypeScript) |
| Agent orchestration | LangGraph.js |
| Agent execution | OpenAI Agents SDK TS |
| Coding engine | [opencode](https://opencode.ai) via `@opencode-ai/sdk` |
| Database | SQLite + Drizzle ORM |
| Testing | Vitest, Playwright |
| Workspace | Local workspace + Docker sandbox |
| Deployment | Local preview + Cloudflare Tunnel |

## Monorepo Structure

```
apps/
  web/              Next.js control console (Stream/Swimlane + 5-tab right panel)
  api/              Hono REST API + SSE endpoints
packages/
  shared/           Zod schemas, DB schema, status machine, events, gates, redaction
  agent-core/       Agent registry, executor, model routing, OpenCode harness
  workflow/         Requirement/development/testing workflow engines
  workspace/        Project workspace, git, shell, sandbox, risk grading, test runners
  ui/               Shared UI components
data/
  app.sqlite        Local SQLite database
generated-projects/  Per-project repo + artifacts + logs
handbook/           Milestone implementation guides
```

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 9+
- Git
- Docker (optional, for high-risk sandbox)

### Install

```bash
pnpm install
```

### Database Setup

```bash
pnpm migrate
```

### Development

```bash
pnpm dev
```

The API server starts at `http://localhost:3001`. The web console starts at `http://localhost:3000`.

### Testing

```bash
pnpm test
```

### Engine Modes

OneCompany supports two engine modes:

| Mode | When | Behavior |
|------|------|----------|
| **Real** | Default (with API keys + OpenCode CLI) | Full OpenCode harness, governed authorize, real test runners, LLM agents |
| **Stub** | `OC_USE_STUB_ENGINE=1` | StubHarness, auto-approve, always-pass checks, scripted agents |

Integration tests run behind `OC_OPENCODE_INTEGRATION=1` to exercise the real engine. The weekly `opencode-integration` GitHub workflow runs the full golden path to `Delivered` (see `handbook/acceptance/evidence/golden-path-run.md`).

### Environment Variables

Key configuration (see [.env.example](.env.example) for full list):

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | LLM provider key for workflow agents |
| `OC_LLM_API_KEY` / `OC_LLM_BASE_URL` | Alternative OpenAI-compatible endpoint |
| `ZHIPU_API_KEY` | Zhipu/GLM model key (used by OpenCode) |
| `OC_USE_STUB_ENGINE` | Set to `1` for stub mode |
| `OC_OPENCODE_INTEGRATION` | Set to `1` for integration tests |
| `OC_OPENCODE_MODEL_CHEAP` | Model ref for cheap tier (e.g. `zhipuai-coding-plan/glm-5.1`) |
| `OC_OPENCODE_MODEL_STANDARD` | Model ref for standard tier |
| `OC_OPENCODE_MODEL_STRONG` | Model ref for strong tier |

## Development Milestones

| ID | Milestone | Status |
|----|-----------|--------|
| M0 | Foundations & repo setup | ✅ Done |
| M1 | Event log + SSE + status machine + gate foundation | ✅ Done |
| M2 | Agent registry + orchestration skeleton | ✅ Done |
| M3 | Requirement workflow | ✅ Done |
| M4 | Human gate UI + gate policies | ✅ Done |
| M5 | Workspace, git, shell, sandbox | ✅ Done |
| M6 | Development workflow (TDD loop, OpenCode) | ✅ Done |
| M7 | Testing & QA integration + local preview | ✅ Done |
| M8 | Right panel tabs | ✅ Done |
| M9 | Info stream + swimlane renderers | ✅ Done |
| **M9.5** | **Real engine integration & de-stub** | **✅ Done** |
| **M10** | **Deployment, delivery, change requests** | **✅ Done** |
| **M11** | **Hardening & MVP acceptance** | **✅ Done** |
| M12 | Integration Gateway + offline Skill Packs | ✅ Done ([plan](handbook/m12-implementation-plan.md)) |
| M13 | Spec-review remediation & hardening | 📋 Next ([plan](handbook/m13-remediation-plan.md)) |

## Event System

All state changes emit typed events through an append-only log:

```typescript
type EventEnvelope<TPayload> = {
  eventId: string;
  seq: number;              // monotonically increasing per project
  schemaVersion: string;
  projectId: string;
  runId?: string;
  agentId?: string;
  timestamp: string;
  payload: TPayload;
};
```

Event types include: `project.created`, `agent.started/plan/act/observe/reflect`, `agent.error`, `run.failed`, `tool_call.started/output/failed`, `diff.created`, `test.result`, `human_gate.created/resolved`, `change_request.created/resolved`, and `artifact.created`.

The frontend consumes events via SSE and renders them through two interchangeable views — **Stream Mode** (chronological feed with inline gates) and **Swimlane Mode** (agent rows × Plan/Act/Observe/Reflect columns) — both backed by the same event projection.

## Console UI

The control console follows a Claude-inspired warm visual style:

- **Top nav**: project switcher, status/phase pills, run/pause, deploy entry, avatar dropdown → Settings
- **Left panel**: Stream Mode (default) with user messages, agent events, inline gate cards, and sticky composer; switchable to Swimlane Mode
- **Right panel**: five tabs — Files, Preview, Terminal, Tests, Report
- **Project Hub** (from switcher): multi-project management with 9-stage lifecycle timeline
- **Settings** (from avatar): environment status, API key readiness, tool checks, read-only policy chips

## License

Private. All rights reserved.
