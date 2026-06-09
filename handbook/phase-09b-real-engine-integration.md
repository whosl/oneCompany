# Phase M9.5 — Real Engine Integration & De-stub

Detailed task breakdown: [m9.5-implementation-plan.md](./m9.5-implementation-plan.md)

## Goal

Make the running product use the REAL engine. Up to here (M2–M9) the workflow graphs, gates, events, projections, and UI were built and demoed on top of scripted fixtures and stubbed boundaries. The real pieces exist (from M5/M6/M7) but the API service path does not call them. In this phase you wire them in and remove the fixtures from the runtime path.

This is MVP-critical. Do it before M10 (deployment) and M11 (acceptance): those milestones are meaningless if they validate against faked execution.

## Prerequisites

- M6 done: the development workflow, `CodingHarness` interface, `OpencodeHarness`, and the opencode permission/event/log bridges exist.
- M7 done: real test runners (Vitest/typecheck/build/Playwright) and the scoped-vs-final separation exist.
- M5 done: `createAuthorize` (risk grading + gate) exists in `packages/workspace`.
- M9 done: the console renders from a single projection over the event stream.

## Concepts You Need

- "Stub" vs "real": a stub returns a fixed answer so the rest of the system can run (for example, "the tests passed"). It is fine for building structure and for tests, but it must never be on the default runtime path of the shipped product.
- The exact seams to remove are all in the API service layer. They were intentionally left as stubs; your job is to replace each with the real component that already exists in a package.
- The authoritative test result (spec §5.5, §15) comes from OneCompany's own scoped test run, not from opencode's internal loop. LangGraph transitions on the authoritative result.
- Model routing (spec §13) chooses cheap/standard/strong models. Real agents and opencode both go through it.
- In-house agents use **LangChain** `ChatOpenAI.withStructuredOutput` (not OpenAI Agents SDK). Tools bind via `agent.tools` → registered local/workspace tools → governed `callTool` pipeline. MCP/Skill Packs stay M12.
- Requirement and Development macro flows use **LangGraph StateGraph** with `interrupt()` / `Command({resume})`. Set `OC_USE_LEGACY_ENGINE=1` only to run the old hand-rolled engines in tests.
- Keep stubs available for tests behind `OC_USE_STUB_ENGINE=1`. Demote them; do not delete them.

## Spec References

`spec.md` §10.1 (orchestration boundary), §10.4 (CodingHarness/opencode), §12 (risk grading), §13 (model routing), §15 (testing), §5.5 (slice vs final tests), §8.2 (logging/redaction).

## Where The Stubs Live (read before you start)

In `apps/api/src/development/service.ts`, `buildDeps` currently sets:

```ts
harness: StubHarness,
authorize: async () => ({ allow: true }),
runAuthoritativeCheck: async () => ({ passed: true, details: "api-default-pass" }),
runAgent: async (input) => runAgent({ db, onEvent, runner: async (id, task) =>
  ({ output: runScriptedDevAgent(id, task as DevAgentTask) }) }, input),
```

In `apps/api/src/requirement/service.ts`, the runner calls `runScriptedRequirementAgent`.

In `packages/agent-core/src/harness/opencode-harness.ts`, `OpencodeHarness.runSlice` throws unless `OC_OPENCODE_INTEGRATION=1`.

Each task below replaces one of these.

## Tasks

### Task 9b.1 — Real coding harness

Start red: write an integration test (behind a flag) that runs one real opencode slice through the development service and asserts real `tool_call.*` / `diff.created` events are emitted (not the stub's fixed output).

Make `OpencodeHarness` actually drive opencode per the M6 bridges (one server per project, lifecycle-managed, isolated workspace/session). In `apps/api/src/development/service.ts`, replace `harness: StubHarness` with the real `OpencodeHarness`. Keep `StubHarness` selectable for tests (for example via an env flag or a service option), defaulting to real opencode in the running product.

Verify: the flagged integration test drives a real slice; unit tests that opt into `StubHarness` still pass.

### Task 9b.2 — Governed authorization

Start red: write a test asserting that a high-risk opencode action raises a gate (does not auto-approve).

Replace `authorize: async () => ({ allow: true })` with M5's `createAuthorize(projectId, deps)` from `@oc/workspace` so opencode shell/edit actions are risk-graded and gated per spec §12. Wire it to the same `GateService` the rest of the app uses.

Verify: a high-risk action is blocked/gated; a low-risk action proceeds; the decision is logged.

### Task 9b.3 — Authoritative scoped tests

Start red: write a test where the scoped suite fails and assert the slice does not advance (and the failure is surfaced to the projection/frontend).

Replace `runAuthoritativeCheck: async () => ({ passed: true })` with M7's real scoped test runner for the slice's scope. The real pass/fail must drive the LangGraph transition and appear in the Tests tab and stream (spec §5.5, §15).

Verify: a passing scope advances the slice; a failing scope keeps `Developing` and shows the failure; results are event-streamed.

### Task 9b.4 — Real model-routed agents

Start red: write a contract test that the development and requirement agents call the model router (spec §13) and emit the P/A/O/R event contract with real outputs.

Replace scripted runners on the default runtime path with the LangChain in-house runner (`packages/agent-core/src/agents/langchain-runner.ts`) using §13 model routing. Ensure `agent.tools` allowlisted tools route through `packages/agent-core/src/tools/bind-tools.ts` and `callTool`. Keep scripted runners as test-only fixtures (`OC_USE_STUB_ENGINE=1`).

Verify: agents run through the router; P/A/O/R summaries come from model output (not hardcoded stubs); scripted runners are only reachable from tests; tool calls emit `tool_call.*` events.

### Task 9b.5 — Remove fixture seams from the runtime path

Confirm no production caller passes a `RequirementFixtureProfile`. The web composer already omits `profile` (the server default handles `undefined`). Grep the codebase for `profile:` and fixture profile literals (`"complete"`, `"vague"`, `"happy_path"`, etc.) and ensure they appear only in tests.

Verify: starting a requirement from the UI works with no `profile` in the request body; a repo grep shows fixture profiles only under test files.

### Task 9b.6 — Config and degradation

Define and test behavior when secrets/engines are missing:
- Missing `OPENAI_API_KEY`: degrade to mock data + a clear prompt (spec §12), never silently fake success.
- opencode/model unavailable: surface a clear error/gate, do not auto-pass.
- Ensure secret redaction (spec §8.2) covers opencode and model I/O on the event stream, logs, and artifacts.

Verify: removing the key produces the documented degraded behavior; redaction tests cover opencode/model output.

### Task 9b.7 — Golden-path integration test

Add one end-to-end integration test (behind the integration flag in CI) that runs a project from requirement → PRD → tech plan → at least one governed real opencode slice → real scoped tests → preview, asserting events/status come from real execution.

Verify: the flagged golden-path test passes on the real engine.

## Verification

```bash
pnpm -w typecheck && pnpm -w test
# real-engine integration tests run behind a flag, for example:
OC_OPENCODE_INTEGRATION=1 pnpm -w test
# manual: start a project from the UI; confirm real opencode activity, gated high-risk actions, and real test results in the Tests tab
```

## Definition of Done

- [x] `apps/api/src/development/deps.ts` uses the real `OpencodeHarness` by default; `StubHarness` is test-only (`OC_USE_STUB_ENGINE=1`).
- [x] `authorize` uses M5 `createAuthorize` (risk-graded + gated); no `allow:true` stub on the runtime path.
- [x] `runAuthoritativeCheck` uses M7's real scoped runner; transitions and UI reflect real pass/fail.
- [x] Development and requirement agents are real and model-routed (§13 OpenAI-compatible client); scripted runners are test-only fixtures.
- [x] No production caller passes a fixture `profile`; fixture profiles appear only in tests.
- [x] Missing key / unavailable engine degrade per spec §12 without faking success; redaction covers opencode/model I/O.
- [x] A flagged golden-path integration test (`OC_OPENCODE_INTEGRATION=1`) exercises the real engine path.

## Do Not

- Do not delete the scripted runners or `StubHarness`; demote them to test-only.
- Do not auto-approve opencode actions; route them through `createAuthorize`.
- Do not let opencode's internal "tests passed" stand in for the authoritative scoped run.
- Do not put model-routing, status, budget, or gate logic inside an agent or the harness (spec §10.1, §10.4).
- Do not ship any `passed:true` / `allow:true` shortcut on the default runtime path.

## Output

- The shipped product runs the real engine end-to-end: governed opencode slices, authoritative scoped tests, and model-routed agents — so M10 deployment and M11 acceptance validate real behavior, not fixtures.
