# Phase M2 — Agent Registry + Orchestration Skeleton

## Goal

Prove the orchestration design with a fake (no-op) agent. After this phase: a LangGraph workflow can run one node, that node runs one agent via the OpenAI Agents SDK, and the agent emits the full Plan/Act/Observe/Reflect event sequence. Forcing a failure produces failure events.

> Engine note (spec v0.3, §10.4): the Development group's coding agent runs on **opencode** behind a swappable `CodingHarness`. In this phase you only define the `CodingHarness` interface (`runSlice` + `authorize`) and a **test stub** — the real `OpencodeHarness` lands in M6. The orchestration boundary below is unchanged: budgets/status/gates stay in LangGraph, never in the harness.

## Prerequisites

- M1 done. You have `emit()`, `setStatus`, the status machine, SSE, and the gate primitive.

## Concepts You Need

- Orchestration boundary (spec §10.1, L5) — memorize this split:
  - LangGraph owns the macro workflow: nodes, durable state, loop budgets, status transitions, and gate nodes.
  - The OpenAI Agents SDK owns what happens inside one node: a single agent's own ReAct reasoning and its tool calls.
  - Budgets and status changes NEVER live inside an agent. The agent reports an outcome; LangGraph decides the next move.
- Agent registry: agents are looked up by `agentId@version`, not imported as classes. This lets us swap agents later.
- Model routing (spec §13): pick a model tier (`cheap` / `standard` / `strong`) per agent. Not user-configurable.
- Coding engine adapter (spec §10.4): the Development group will run on opencode behind a `CodingHarness`. M2 only defines the interface + a stub; M6 implements `OpencodeHarness`.

## Spec References

`spec_0.2.md` §7, §10.1, §10.4, §13, §8.1, §14.4.

## Tasks

### Task 2.1 — Agent registry

Create `packages/agent-core/src/registry.ts`:

```ts
function registerAgent(def: AgentDefinition): void;
function getAgent(idAtVersion: string): AgentDefinition; // e.g. "intake@1.0.0"; throw if missing
function listAgents(): AgentDefinition[];
```

- `AgentDefinition` comes from `@oc/shared` (spec §7).
- Persist registered agents into the `agents` table so they survive restarts.
- Workflows must reference agents by `agentId@version` strings only.

Verify: register a dummy agent, then `getAgent("dummy@1.0.0")` returns it; an unknown id throws.

### Task 2.2 — Single-agent executor (Agents SDK)

Create `packages/agent-core/src/executor.ts`:

```ts
async function runAgent(input: {
  projectId: string;
  agentIdAtVersion: string;
  task: unknown;            // input for the agent
}): Promise<{ runId: string; output: unknown; failed: boolean }>;
```

Rules:
- Create a `runId`, write a row in `agent_runs`.
- Emit `agent.started`.
- Run the agent through the OpenAI Agents SDK. As it works, emit `agent.plan`, `agent.act`, `agent.observe`, `agent.reflect` with short summaries.
- Pick the model from the agent's `modelPolicy.tier` via the router (Task 2.4).
- On any error, emit `agent.error` then `run.failed`, set `failed: true`, and return (do not throw out of the node here; let LangGraph decide).
- Never emit hidden chain-of-thought. Only short summaries (spec §8.1).

For this phase the "agent" can be a stub that returns canned text. Real agents come in M3/M6.

Verify: `runAgent` with a stub emits started -> plan -> act -> observe -> reflect in order, and writes an `agent_runs` row.

### Task 2.3 — Tool-call plumbing

Add a helper used by agents to call a tool:

```ts
async function callTool(input: { projectId: string; toolName: string; args: unknown }): Promise<unknown>;
```

- Emit `tool_call.started`, write a `tool_calls` row.
- On success emit `tool_call.output`. On error emit `tool_call.failed`.

Verify: calling a stub tool emits `tool_call.started` then `tool_call.output`; a failing tool emits `tool_call.failed`.

### Task 2.4 — Model router

Create `packages/agent-core/src/router.ts`:

```ts
function pickModel(tier: "cheap" | "standard" | "strong"): string; // returns a model id
```

- Map tiers to concrete model ids per spec §13 defaults. Not user-configurable in MVP.

Verify: `pickModel("strong")` returns the strong-tier model id.

### Task 2.5 — LangGraph harness

Create `packages/agent-core/src/graph.ts`:
- A small wrapper to define a workflow as nodes over a durable state object.
- A node can: read/write durable state, call `runAgent`, emit events, and decide the next node.
- Add a placeholder "gate node" type that calls `createGate` + `waitForGate` (from M1) and routes based on the decision.
- Budgets (counters) live in the durable state and are checked in nodes, never inside `runAgent`.

Verify: build a 2-node demo graph: node A runs the stub agent; node B logs "done". Running the graph produces the agent's P/A/O/R events then finishes.

## Verification

```bash
pnpm -w typecheck && pnpm -w test
# manual/integration: run the demo graph for a project
#   -> SSE shows agent.started, agent.plan, agent.act, agent.observe, agent.reflect
# manual: force the stub to throw -> SSE shows agent.error then run.failed
```

## Definition of Done

- [ ] Agents are registered and resolved by `agentId@version`, persisted in `agents`.
- [ ] `runAgent` emits the full P/A/O/R sequence and writes `agent_runs`.
- [ ] A forced failure emits `agent.error` then `run.failed` (and does not crash the graph).
- [ ] Tool calls emit `tool_call.started` and then `output` or `failed`.
- [ ] Model router maps tiers to model ids per §13.
- [ ] A demo LangGraph workflow runs nodes, can use a gate node, and keeps budgets in durable state.

## Do Not

- Do not put loop budgets or status transitions inside `runAgent` or inside the agent. They live in graph nodes (durable state).
- Do not emit raw chain-of-thought. Emit short summaries only.
- Do not import agents as classes in workflows. Use the registry.

## Output

- `runAgent` (single-agent executor) and `callTool`, used by all real agents.
- The agent registry and model router.
- The LangGraph harness with gate nodes and durable-state budgets, used by M3 and M6.
