# M0 Implementation Plan — Foundations & Repo Setup

Status: complete (M0 DoD passed)
Branch: `feat/m0-foundations` → merge into `master` when DoD passes
Source: `spec.md` v0.3.2 §3.1, §4.2, §5.2, §7, §8.1, §10.1–10.3; `handbook/phase-00-foundations.md`
Estimated effort: 2–4 days (one engineer)

## 1. Goal

Deliver a **buildable monorepo skeleton** with no product features:

- `apps/web` boots and shows `OneCompany`
- `apps/api` boots and `GET /health` returns `{ "ok": true }`
- Five workspace packages compile (`shared`, `agent-core`, `workflow`, `workspace`, `ui`)
- `pnpm migrate` creates `data/app.sqlite` with all **18 MVP tables** (§10.3)
- `packages/shared` exports zod schemas + types used by both apps

**M0 explicitly excludes** (deferred per spec v0.3.2):

- `packages/integrations` and post-MVP integration tables (`integration_definitions`, etc.) — **M12**
- `IntegrationDefinition`, `SkillPack` shared types — **M12**
- `CodingHarness` / `OpencodeHarness` — **M2 stub, M6 implementation**
- LangGraph, agents, SSE, UI panels, workspace execution, Figma console

## 2. Prerequisites

| Tool | Version | Verify |
| --- | --- | --- |
| Node.js | ≥ 20 | `node -v` |
| pnpm | ≥ 9 | `pnpm -v` |
| git | any | `git --version` |
| Docker | any (not used in M0) | `docker --version` |

## 3. Target Tree (end state)

```text
OneCompany/
├── apps/
│   ├── web/                    # @oc/web — Next.js 15, Tailwind, shadcn/ui
│   └── api/                    # @oc/api — Hono, port 3001
├── packages/
│   ├── shared/                 # @oc/shared — zod, types, db schema, migrate
│   ├── agent-core/             # @oc/agent-core — empty barrel (M2: registry + CodingHarness stub)
│   ├── workflow/               # @oc/workflow — empty barrel
│   ├── workspace/              # @oc/workspace — empty barrel
│   └── ui/                     # @oc/ui — empty barrel
├── data/
│   └── app.sqlite              # gitignored, created by migrate
├── generated-projects/         # gitignored, .gitkeep only
├── handbook/
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── vitest.config.ts
├── eslint.config.mjs
├── .prettierrc
└── .gitignore
```

Note: `packages/integrations` is listed in spec §10.2 but is **not created in M0**; add it in M12.

## 4. Execution Order

Tasks map 1:1 to `phase-00-foundations.md`. Do them **in order**; each has a verify gate.

| Task | Summary | Verify |
| --- | --- | --- |
| 0.1 | Root tooling | `pnpm install` |
| 0.2 | `apps/web` | dev shows OneCompany |
| 0.3 | `apps/api` | `curl /health` |
| 0.4 | Five packages | `pnpm -w build` |
| 0.5 | DB + migrate runner | `pnpm migrate` creates sqlite |
| 0.6 | 18 MVP tables | sqlite lists 18 tables |
| 0.7 | Shared zod types | `pnpm -w typecheck` |

## 5. Task Details

### Task 0.1 — Root tooling

Root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.gitignore`, ESLint, Prettier, Vitest.

### Task 0.2 — Scaffold `apps/web`

Next.js + Tailwind + shadcn/ui init; placeholder page `OneCompany`.

### Task 0.3 — Scaffold `apps/api`

Hono on port 3001; `GET /health`; workspace dep on `@oc/shared`.

### Task 0.4 — Scaffold packages

Five `@oc/*` packages with tsup build; empty barrels except `shared`.

### Task 0.5–0.6 — Database

Drizzle + better-sqlite3 in `@oc/shared`; 18 tables per spec §10.3 (not integration tables).

### Task 0.7 — Shared types

`EventEnvelope`, `AgentEvent` (20 variants), `RequirementState`, `DevState`, `AgentDefinition`, `ProjectStatus`, `STATUS_TRANSITIONS` — field names from spec §4.2, §5.2, §7, §8.1, §3.1.

## 6. Definition of Done

- [x] `pnpm install` succeeds
- [x] `apps/web` shows `OneCompany`
- [x] `apps/api` `/health` returns `{ "ok": true }`
- [x] All five packages build
- [x] `data/app.sqlite` has 18 MVP tables
- [x] `@oc/shared` exports all required schemas/types
- [x] Both apps import from `@oc/shared`
- [x] No integration tables, no `packages/integrations`, no business logic

## 7. What Later Phases Need

| Artifact | Consumer |
| --- | --- |
| `events` + `EventEnvelope` | M1 event log + SSE |
| `projects` + `project_status_history` | M1 status machine |
| `human_gates` | M1 gate persistence |
| `@oc/shared` + monorepo scripts | M0–M11 |
| `agent-core` package shell | M2 registry + `CodingHarness` stub |

---

*Implement on `feat/m0-foundations`; merge when §6 DoD is green.*
