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

`spec_0.2.md` §5 (all), §3.1 (Developing/Tech Plan/Change Review), §10.3, §10.4, §12, §13.

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

For the current slice, run this as a LangGraph sub-flow (counters in durable state, NOT in the agent):
1. Plan: `coding`/`planner` defines the task details.
2. Act: write the failing tests FIRST (via `test-designer` + workspace file writes), then implement code.
3. Observe: run the slice-scoped checks via M5 `runCommand` — typecheck, this slice's unit/integration tests, build, targeted browser check. Capture results.
4. Reflect: `review`/`qa` summarizes pass/fail and whether replanning is needed.
5. Fix loop: if checks fail and `currentSliceAttempts < maxSliceAttempts`, increment and repeat from Act.
6. Commit: when checks pass, `commitSlice` (M5) and emit `diff.created`; write to `diffs`.
7. Move to the next slice.

Verify: a simple slice goes Plan -> failing tests -> implement -> green -> commit, producing one commit and a `diff.created` event.

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

## Do Not

- Do not run the full app-wide test suite inside the per-slice loop. That is M7.
- Do not put the retry counter inside the agent. It lives in durable state.
- Do not skip a slice silently. Always go through Change Review.

## Output

- Committed code produced slice by slice, with diffs and a versioned tech plan.
- Change Review handling, reused by M10 for user change requests.
