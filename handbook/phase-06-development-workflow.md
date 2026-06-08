# Phase M6 — Development Workflow (Plan + ReAct + TDD)

## Goal

Go from a confirmed PRD to committed code. The architect writes a technical plan (gated), then work is split into function slices, and each slice is built test-first and committed. A slice that cannot pass after its retry budget raises a gate.

> Engine note (spec v0.3, §10.4): the per-slice loop runs on **opencode** via `OpencodeHarness` (a local `opencode serve` per project, loopback). opencode does the intra-slice TDD loop; OneCompany runs the **authoritative** scoped test at the slice boundary and shows it in Tests + stream. opencode actions go through the **permission bridge** (§12 risk/sandbox/gate) and **log bridge** (§8.2 redaction). Model selection follows §13 with managed keys. The bridge wiring is an additive follow-up to the tasks below; the slice loop, budgets, gates, and commit policy here are unchanged.

## Prerequisites

- M3 done (PRD + acceptance criteria exist). M4 done (gates: tech plan confirm, slice failure, change review). M5 done (workspace, git, shell, sandbox, logging).

## Concepts You Need

- Function slice (spec §5.3): a small, testable feature, usually one commit.
- Per-slice loop (spec §5.3): Plan -> Act (write failing tests FIRST) -> Observe (run scoped checks) -> Reflect -> Fix (repeat) -> Commit.
- Per-slice checks vs final suite (spec §5.5): in this phase, Observe runs only the checks scoped to the current slice. The full app-wide suite is the separate `Testing` phase (M7). Do not run the whole suite per slice.
- Retry budget (spec §5.2, §5.3): `maxSliceAttempts` default 4. When exhausted, raise the Slice Failure gate.
- Slice Failure gate options (spec §5.3, §6): retry / replan (-> Tech Plan Review) / request_skip_slice (-> Change Review) / fail (-> Failed).
- Skipping a slice is NOT a silent waiver (spec §5.4, R4). It goes through Change Review, which must update PRD/acceptance criteria or keep the acceptance criterion blocking.

## Spec References

`spec.md` §5 (all), §3.1 (Developing/Tech Plan/Change Review), §10.3, §10.4, §12, §13.

## Tasks

### Task 6.1 — Development agents

Register these agents (spec §5.1): `architect`, `test-designer`, `planner`, `coding`, `review`, `qa`, `devops-delivery`. Use model tier per §13 (architecture/coding/review = `strong`).

Verify: all seven are registered and return schema-valid output.

### Task 6.2 — DevState

Persist `DevState` (from `@oc/shared`, spec §5.2), including the task queue, `maxSliceAttempts` (4), and `currentSliceAttempts`.

Verify: create, update, reload DevState; the slice queue and counters persist.

### Task 6.3 — Technical plan + gate

- Run `architect` to produce the technical plan (architecture, stack, data model, risk, deployment approach).
- Save a row in `tech_plan_versions`; set `techPlanVersion`.
- Set status `Tech Plan Review` and raise the `tech_plan_confirm` gate.
- On approve -> status `Developing`. On reject -> stay in `Tech Plan Review` and replan.

Verify: a confirmed PRD produces a tech plan version and a tech-plan gate; approve moves to `Developing`.

### Task 6.4 — Slice planning

Run `planner` (or `test-designer` + `planner`) to fill the `DevState.taskQueue` with function slices derived from the acceptance criteria. Each slice has: goal, acceptance checks, expected files, test strategy.

Verify: a tech plan yields a non-empty task queue of slices.

### Task 6.5 — Per-slice loop

For the current slice, run this as a LangGraph sub-flow (counters in durable state, NOT in the agent or the engine). The coding itself runs on opencode via `OpencodeHarness` — see the "opencode Engine" section (E1–E6) below for how to build it.
1. Plan: build a `SliceSpec` (goal, acceptance checks, the slice-scoped `testCommand`, model tier `strong`) from the current slice.
2. Act + Observe (engine): call `OpencodeHarness.runSlice(slice, ctx)`. opencode writes the failing tests first, implements, and iterates. Its events stream into the info stream through the event bridge (E3), and every shell/edit passes through `ctx.authorize` (risk grading, E4).
3. Authoritative check: regardless of what opencode reports, run the slice-scoped `testCommand` yourself via M5 `runCommand` with a structured reporter (e.g. `vitest --reporter=json`), parse pass/fail, and emit `test.result`. This is the value the loop trusts (spec §10.4, O4).
4. Reflect: `review`/`qa` summarizes pass/fail and whether replanning is needed.
5. Fix loop: if the authoritative check fails and `currentSliceAttempts < maxSliceAttempts`, increment and repeat from step 2.
6. Commit: when the authoritative check passes, `commitSlice` (M5) and emit `diff.created`; write to `diffs`.
7. Move to the next slice.

Verify: a simple slice goes Plan -> opencode writes failing tests -> implement -> your authoritative test is green -> commit, producing one commit and a `diff.created` event.

### Task 6.6 — Slice Failure gate (budget exhausted) — REQUIRED

When `currentSliceAttempts` reaches `maxSliceAttempts` and checks still fail, raise the Slice Failure gate with options:
- `retry` -> extend the budget, continue.
- `replan` -> set status `Tech Plan Review`, re-run architect/planner.
- `request_skip_slice` -> set status `Change Review` (Task 6.7). Do NOT silently drop the feature.
- `fail` -> set status `Failed`.

Verify: force a slice to keep failing; after 4 attempts the gate appears; test all four options.

### Task 6.7 — Change Review for skip + changes

Handle `Change Review` (spec §5.4, R4):
- For a skip-slice request: create a `change_requests` row, emit `change_request.created`. The change must either update PRD + acceptance criteria (dropping/altering the feature) or keep the acceptance criterion blocking (skip denied). A required feature cannot be waived by only logging a risk.
- For a user requirement change after the tech plan: analyze impact; if only the task queue changes -> back to `Developing`; if the architecture changes -> back to `Tech Plan Review`.
- Emit `change_request.resolved` with the outcome.

Verify: a skip request enters Change Review and either updates acceptance criteria or stays blocking; a requirement change routes correctly.

### Task 6.8 — Diffs

Record each change set in the `diffs` table and emit `diff.created` so the UI (M8) can show it.

Verify: a committed slice has a `diffs` row and a `diff.created` event.

## opencode Engine (OpencodeHarness, E1–E6)

This implements the `CodingHarness` interface from M2 (Task 2.6) using **opencode** (spec §10.4). Do the steps in order. The opencode SDK evolves, so pin a version and check its docs for the exact method/event names; the shapes below match `@opencode-ai/sdk` and may need small adjustments at your pinned version.

### E1 — Install + pin opencode, set providers/keys

- Add the SDK: `pnpm add @opencode-ai/sdk` and pin an exact version in `package.json` (no `^`). Record the version in the project README.
- Models/keys: opencode picks models from providers via Models.dev and reads API keys from the environment. Use OneCompany-managed keys (the same ones Settings reports as "ready", §14.6). Do NOT use opencode's interactive login or its hosted "Zen" models (spec §13, O5).
- Map §13 tiers to concrete `provider/model` ids (e.g. strong = `anthropic/claude-...`). Reuse the M2 model router (`pickModel`) so there is one routing policy.

Verify: `node -e "require('@opencode-ai/sdk')"` resolves; the pinned version is in the lockfile.

### E2 — Start/stop a local opencode server per project

Create `packages/agent-core/src/harness/opencode-server.ts`:

```ts
import { createOpencodeServer } from "@opencode-ai/sdk";

export async function startProjectServer(repoPath: string) {
  // Local-first: loopback only. opencode serves on 127.0.0.1:<port>.
  const server = await createOpencodeServer({
    hostname: "127.0.0.1",
    // omit port (or use 0) to pick a free port; use server.url for the client
    config: {
      permission: { edit: "ask", bash: "ask" }, // force "ask"; see E4
    },
  });
  return server; // { url, close() }
}
```

Rules:
- One server per project, pointed at that project's `repoPath` (`generated-projects/{slug}/repo`). Bind to `127.0.0.1` only.
- Start it when the development group begins; call `server.close()` on completion or pause.
- Optionally set a server password (env) since it is a local HTTP server.

Verify: starting a server returns a `http://127.0.0.1:<port>` url; `createOpencodeClient({ baseUrl }).session.list()` returns an empty list; `server.close()` frees the port.

### E3 — Event bridge (opencode events -> your events)

Create `packages/agent-core/src/harness/event-bridge.ts`:

```ts
import { createOpencodeClient } from "@opencode-ai/sdk";

export async function bridgeEvents(
  baseUrl: string,
  emit: (e: unknown) => void,
  onPermission: (p: any) => void,
) {
  const client = createOpencodeClient({ baseUrl });
  const events = await client.event.subscribe();
  for await (const ev of events.stream) {
    switch (ev.type) {
      case "message.part.updated":         // streamed assistant/tool output
        emit(mapToAgentEvent(ev));         // -> agent.plan/act/observe/reflect or tool_call.*
        break;
      case "permission.updated":           // opencode wants to run a shell/edit
        onPermission(ev.properties);
        break;
      // map other types you care about (session.updated, message.updated, ...)
    }
  }
  return client;
}
// mapToAgentEvent(ev) is a helper YOU write: turn an opencode event into your
// EventEnvelope/AgentEvent (§8.1). Keep summaries short; never raw chain-of-thought.
```

Rules:
- Translate opencode events into your `EventEnvelope`/`AgentEvent` (§8.1): plan/act/observe/reflect, `tool_call.*`, command output, `diff.created`. The info stream + swimlane then render them unchanged (§14.3.1).
- Large tool/command output is folded behind an artifact link, not inlined (§8.2, R5).

Verify: sending a trivial prompt to a session produces normalized P/A/O/R events on your SSE stream.

### E4 — Permission bridge (opencode "ask" -> your risk grading + gate)

```ts
async function handlePermission(client, sessionId, perm, ctx) {
  const op = toToolOp(perm);              // {kind:"shell"|"edit", command?, path?} — helper you write
  const decision = await ctx.authorize(op); // M5/§12 risk grading + (high risk) M4 gate
  await client.postSessionByIdPermissionsByPermissionId({
    path: { id: sessionId, permissionId: perm.id },
    body: { response: decision.allow ? "allow" : "reject" },
  });
}
```

Rules:
- opencode runs in `ask` mode (E2 config). Every shell/edit raises a permission you must answer.
- Low risk -> auto-allow; medium -> per §12; high -> raise the `dangerous_operation` gate (M4) and answer only after the human decides. Nothing auto-runs at high risk (O3).
- Never configure opencode to auto-approve everything; that bypasses governance.

Verify: a command opencode wants to run (e.g. `rm -rf ...`) is graded High and raises a gate; an `ls` is auto-allowed.

### E5 — Log bridge (redact + chunk)

- Pipe all opencode tool/command output through the M5 redaction + chunking pipeline before persisting or showing it (R5). Store metadata (path, bytes, hash, summary) in the log store; show a folded preview + "open in Terminal".

Verify: output containing a fake API key is redacted in the stored log and in the stream.

### E6 — runSlice (the CodingHarness implementation)

Create `packages/agent-core/src/harness/opencode-harness.ts` implementing the M2 `CodingHarness`:

```ts
import { createOpencodeClient } from "@opencode-ai/sdk";
import type { CodingHarness } from "./types";
import { startProjectServer } from "./opencode-server";
import { bridgeEvents } from "./event-bridge";

export const OpencodeHarness: CodingHarness = {
  async runSlice(slice, ctx) {
    const server = await startProjectServer(ctx.repoPath);
    try {
      const client = createOpencodeClient({ baseUrl: server.url });
      const { data: session } = await client.session.create();
      // start event + permission bridges (E3/E4)
      bridgeEvents(server.url, ctx.emit, (perm) =>
        handlePermission(client, session.id, perm, ctx));
      // TDD prompt: write failing tests first, then implement, then run them
      await client.session.prompt({
        path: { id: session.id },
        body: {
          model: pickModel(slice.modelTier),     // §13 routing + managed keys (or set config.model in E2)
          parts: [{ type: "text", text: tddPrompt(slice) }],
        },
      });
      // AUTHORITATIVE check: run the scoped test ourselves (do not trust self-report)
      const res = await runCommand(ctx.repoPath, slice.testCommand); // M5
      const passed = parseReporter(res.stdout).passed;               // helper you write
      ctx.emit({ type: "test.result", sliceId: slice.sliceId, passed });
      return { passed, summary: passed ? "green" : "red", changedFiles: res.changedFiles };
    } finally {
      await server.close();
    }
  },
};
// tddPrompt(slice): a helper that builds the instruction text from the SliceSpec
// (goal + acceptance checks + "write failing tests first, then implement").
```

Rules:
- opencode does the intra-slice TDD loop; the **authoritative** pass/fail is the test command you run (O4). LangGraph decides retry/commit on that value, not opencode's word.
- Budgets/retries/commit live in Task 6.5/6.6 (LangGraph), never here.
- Wire this `OpencodeHarness` as the `CodingHarness` used by the Task 6.5 loop. `StubHarness` (M2) stays for unit tests.

Verify: `OpencodeHarness.runSlice` on a tiny slice writes a failing test, implements until your authoritative `vitest --reporter=json` is green, streams P/A/O/R + a `test.result`, and asks permission before any shell/edit.

## Verification

```bash
pnpm -w typecheck && pnpm -w test
# integration: confirmed PRD -> tech plan gate -> Developing -> build 1-2 slices -> commits + diffs
# integration: a failing slice -> Slice Failure gate after 4 attempts -> request_skip_slice -> Change Review updates acceptance criteria
```

## Definition of Done

- [ ] All seven dev agents registered.
- [ ] Tech plan is versioned and gated; approve -> Developing, reject -> replan.
- [ ] Task queue is built from acceptance criteria.
- [ ] Per-slice loop writes failing tests first, runs only slice-scoped checks, and commits one commit per slice.
- [ ] Retry budget (4) is enforced; exhaustion raises the Slice Failure gate with all four options working.
- [ ] Skip requests go through Change Review and update acceptance criteria (or stay blocking) — never a silent waiver.
- [ ] Diffs recorded and `diff.created` emitted.
- [ ] The per-slice coding runs on `OpencodeHarness` (one local opencode server per project, loopback `127.0.0.1`).
- [ ] Every opencode shell/edit goes through the permission bridge (risk grading + gate); nothing high-risk auto-runs.
- [ ] The authoritative slice pass/fail comes from your own scoped test run (structured reporter), not opencode's self-report, and is shown in Tests + stream.
- [ ] opencode uses managed keys + §13 model routing; opencode login/Zen are disabled.

## Do Not

- Do not run the full app-wide test suite inside the per-slice loop. That is M7.
- Do not put the retry counter inside the agent. It lives in durable state.
- Do not skip a slice silently. Always go through Change Review.
- Do not let opencode auto-approve shell/edit. Every action goes through the permission bridge (E4).
- Do not trust opencode's self-reported test result for transitions. Run the authoritative scoped test yourself (E6, step 3).

## Output

- Committed code produced slice by slice, with diffs and a versioned tech plan.
- Change Review handling, reused by M10 for user change requests.
- `OpencodeHarness` + event/permission/log bridges — the M2 `CodingHarness` interface, now implemented.
