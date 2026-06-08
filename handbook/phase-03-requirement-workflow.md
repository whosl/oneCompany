# Phase M3 — Requirement Workflow

## Goal

Turn a one-sentence requirement into a confirmed PRD and acceptance criteria. The question loop must always stop on its own (budget or stuck), never loop forever.

## Prerequisites

- M2 done. You have the agent registry, `runAgent`, the LangGraph harness, gate nodes, and durable-state budgets.

## Concepts You Need

- The requirement loop (spec §4.3): analyze -> score -> if not good enough and budget remains, ask a focused question round -> re-score -> repeat.
- Defaults (memorize): score scale 0–100; threshold 85; max question rounds 6; at most 10 questions per round; stuck = score gains < 3 points over 2 rounds in a row.
- Requirement Stuck gate (spec §4.3, §6): raised when the budget runs out or the loop is stuck. Options: keep answering (extend budget), force continue to PRD (logged as a risk), or fail the project.
- The user still confirms the requirement before development starts (PRD Ready -> Tech Plan Review).

## Spec References

`spec.md` §4 (all of it), §3.1 (Draft/Asking/PRD transitions), §6, §10.3.

## Tasks

### Task 3.1 — Requirement agents

Register these agents (spec §4.1) in the registry. Each is a real agent run through `runAgent`:
- `intake` — normalize raw input; find app type, user goal, missing context.
- `requirement-analyst` — extract features, roles, pages, flows, data objects, integrations, constraints, non-functional needs.
- `completeness-scorer` — output a score 0–100 and a list of gaps with severity `low|medium|critical`.
- `question-planner` — output one themed round of at most 10 questions.
- `prd-acceptance` — output the PRD and acceptance criteria.

Use model tiers per §13 (requirement work = `cheap` or `standard`).

Verify: each agent is registered and returns structured output that matches its `@oc/shared` schema.

### Task 3.2 — RequirementState persistence

Store `RequirementState` (from `@oc/shared`, spec §4.2) durably, keyed by `projectId`. Use `requirement_sessions` and `requirement_scores`. Include `completenessThreshold` (85), `maxQuestionRounds` (6), and per-round `scoreAfter`.

Verify: create a session, update it, reload it — values persist including the per-round scores.

### Task 3.3 — Requirement loop graph

Build the loop as a LangGraph workflow (spec §4.3). Node order:
1. `intake` -> update state.
2. `requirement-analyst` -> update state.
3. `completeness-scorer` -> set `completenessScore`, append `scoreAfter`, update `gaps`.
4. Decision node:
   - If `completenessScore >= 85` and no `critical` gap -> set status `PRD Ready`, go to Task 3.5.
   - Else if a question round can still run (see Task 3.4) -> run `question-planner`, set status `Asking Questions`, raise an answer round (Task 3.6), then loop back to step 3.
   - Else -> raise the Requirement Stuck gate (Task 3.4).

Important: the decision logic and counters live in the graph node, not inside any agent.

Note on the very first pass: if the initial analysis already gives score >= 85 with no critical gap, go straight `Draft Requirement -> PRD Ready` (spec §3.1, R3).

Verify: a vague input runs at least one question round; a clearly complete input goes straight to PRD Ready.

### Task 3.4 — Loop termination (budget + stuck) — REQUIRED

This is the most important part of this phase. The loop must stop.
- Round budget: stop asking once `maxQuestionRounds` (6) rounds have run without reaching the threshold.
- Stuck detection: if `scoreAfter` improved by less than 3 points across two rounds in a row while still below 85, mark the loop stuck.
- When budget-exhausted OR stuck: raise the Requirement Stuck gate (use the M1 gate primitive / a gate node) with options:
  - `keep_answering` -> extend the budget by some rounds, continue the loop.
  - `force_continue` -> set status `PRD Ready`, AND record a risk in `RequirementState.risks` and (later) the delivery report.
  - `fail` -> set status `Failed`.

Verify: feed answers that never raise the score; confirm that after the budget/stuck condition the Requirement Stuck gate appears and that each of the three options does the right thing (test all three).

### Task 3.5 — PRD + acceptance generation

When status reaches `PRD Ready`, run `prd-acceptance`. Save a new row in `prd_versions` and `acceptance_criteria_versions`, and set `prdVersion` / `acceptanceCriteriaVersion` in state.

Verify: `PRD Ready` produces one PRD version and one acceptance-criteria version.

### Task 3.6 — Answer intake

Add an API for the user to answer a question round: `POST /projects/:id/requirement/answers` with the answers. Store answers in `questionRounds[].answers`, then let the loop re-score.

Verify: posting answers updates the current round and triggers a re-score.

## Verification

```bash
pnpm -w typecheck && pnpm -w test
# integration A (happy): vague input -> 1+ rounds -> answers -> score >= 85 -> PRD Ready -> PRD + acceptance saved
# integration B (stuck): always-bad answers -> Requirement Stuck gate appears -> test keep_answering / force_continue / fail
# integration C (complete): complete input -> Draft Requirement -> PRD Ready directly
```

## Definition of Done

- [ ] All five requirement agents are registered and produce schema-valid output.
- [ ] `RequirementState` persists with threshold, budget, and per-round scores.
- [ ] The loop produces a versioned PRD + acceptance criteria when complete.
- [ ] The loop ALWAYS terminates: budget exhaustion and stuck detection both raise the Requirement Stuck gate.
- [ ] All three stuck-gate options work (keep answering / force continue+risk / fail).
- [ ] `force_continue` records a risk.
- [ ] Complete initial input goes straight to `PRD Ready`.

## Do Not

- Do not let the loop run with no upper bound. The budget and stuck checks are mandatory.
- Do not put the budget/stuck logic inside an agent. It lives in the graph node.
- Do not skip the gate when stuck. Silent force-continue is not allowed; it must be a recorded decision + risk.

## Output

- A working requirement workflow that ends in `PRD Ready` with saved PRD + acceptance versions, or in `Failed`.
- The Requirement Stuck gate, resolvable by API now and by card UI after M4.
