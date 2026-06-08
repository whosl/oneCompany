# Phase M4 — Human Gate UI + Gate Policies

## Goal

Give people real cards to make decisions. Each gate type shows the right options, blocks the workflow until resolved, resumes it after, and logs the decision.

## Prerequisites

- M1 done (gate create/wait/resolve primitive + resolve API). M3 is helpful for a real gate to test against, but M4 only strictly needs M1.

## Concepts You Need

- Gate types (spec §6): requirement confirm, technical plan confirm, requirement stuck, slice failure, change review, deployment, dangerous operation, final acceptance.
- Per-gate action policy (spec §6, L4): the default action set is Approve / Revise then approve / Reject and redo / Skip risk and continue / Custom instruction. BUT:
  - "Skip risk and continue" is allowed ONLY for low/medium operation gates (for example a medium-risk dangerous-operation prompt).
  - It must NOT appear for: deployment confirmation, high-risk/destructive operation confirmation, requirement confirmation, technical plan confirmation, final acceptance.
  - The stuck / slice-failure / change gates use their own scoped options instead of the generic set.
- Blocking + logged: a gate stops the workflow; resolving it records `human_gate.resolved` and resumes the workflow.
- Final placement: in the Figma UI baseline, gates render inline inside Stream Mode. The sticky Stream composer can provide custom text for the active gate, but it must still submit one of the gate's allowed decisions. UI placement never changes the server-side policy.

## Spec References

`spec_0.2.md` §6, §8.1, §8.2.

## Tasks

### Task 4.1 — Gate type registry

Create a definition for each gate type: its id, a title, a description template, and its allowed options. Put this in `packages/shared` so both api and web use the same list.

Per-gate options (use these):
- `requirement_confirm`: approve / revise_then_approve / reject_and_redo / custom. (no skip risk)
- `tech_plan_confirm`: approve / revise_then_approve / reject_and_redo / custom. (no skip risk)
- `requirement_stuck`: keep_answering / force_continue / fail.
- `slice_failure`: retry / replan / request_skip_slice / fail.
- `change_review`: update_plan / revise_tech_plan / reject.
- `deployment`: approve / reject / custom. (no skip risk)
- `dangerous_operation`: approve / skip_risk_and_continue / reject / custom. (skip allowed only when the operation is low/medium)
- `final_acceptance`: accept / reject_and_redo / custom. (no skip risk)

Verify: a unit test asserts that `skip_risk_and_continue` is NOT in the options for deployment, tech_plan_confirm, requirement_confirm, final_acceptance, and destructive dangerous_operation.

### Task 4.2 — Enforce the policy server-side

When `POST /gates/:id/resolve` is called, reject any decision that is not in the gate's allowed options. Never trust the client.

Verify: trying to resolve a `deployment` gate with `skip_risk_and_continue` returns an error.

### Task 4.3 — Gate card component

In `apps/web`, build a `GateCard` component:
- Shows title + description.
- Renders one option tab per allowed option (spec §6 says use option tabs).
- Supports a custom free-text input when `custom` is an option.
- On click, calls the resolve API with the chosen option (and custom text if any).
- Is layout-agnostic: it can render in a temporary gate page now and inline in the Stream Mode feed when M9 lands.

Verify: a gate appears as a card with exactly its allowed options; resolving it calls the API and the card clears.

### Task 4.4 — Minimal shell to show gates

If the full M9 layout is not built yet, add a minimal page in `apps/web` that lists open gates for a project and renders a `GateCard` for each (read open gates from the SSE `human_gate.created` events or a `GET /projects/:id/gates` endpoint).

Verify: when a workflow raises a gate, it shows up here and can be resolved, and the workflow continues.

### Task 4.5 — Decisions are logged

Confirm every resolution writes `human_gate.resolved` with the decision, and that the `human_gates` row stores the decision and `resolved_at`. (This mostly reuses M1; just verify.)

Verify: resolving any gate produces a `human_gate.resolved` event and a stored decision.

## Verification

```bash
pnpm -w typecheck && pnpm -w test
# manual: trigger the Requirement Stuck gate from M3 -> resolve it from the card -> workflow continues
# manual: try an illegal option server-side -> rejected
```

## Definition of Done

- [ ] Every gate type has a definition with the correct allowed options.
- [ ] Server rejects options not allowed for that gate type.
- [ ] "Skip risk and continue" never appears for deployment, requirement confirm, tech plan confirm, final acceptance, or destructive operations.
- [ ] `GateCard` renders option tabs + optional custom input and resolves via API.
- [ ] `GateCard` is reusable inside the Stream Mode feed and compatible with the future sticky composer custom-input path.
- [ ] Resolving a gate resumes the blocked workflow.
- [ ] Every decision emits `human_gate.resolved` and is stored.

## Do Not

- Do not show "Skip risk and continue" on high-risk/destructive or confirmation gates.
- Do not let the workflow continue past a gate without a recorded decision.
- Do not trust the client to enforce options. Enforce on the server.

## Output

- Reusable gate cards + a server-enforced policy, used by every later phase that needs a human decision (tech plan, slice failure, deployment, change review, final acceptance).
