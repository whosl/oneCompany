# Phase M11 — Hardening & MVP Acceptance

## Goal

Prove the whole product meets every MVP acceptance criterion in spec §18, on a real sample app, end to end.

## Prerequisites

- M0–M10 done.

## Concepts You Need

- This phase adds little new code. It runs the full system, finds gaps, and fixes them.
- The bar is spec §18. Every bullet there must be true and demonstrated.

## Spec References

`spec_0.2.md` §18, §8.2, §3.1, §12.

## Tasks

### Task 11.1 — Golden-path end-to-end run

Drive one small real requirement (for example: "a to-do web app") from one sentence all the way to `Delivered`:
1. Create project -> requirement loop -> PRD + acceptance.
2. Confirm requirement -> tech plan -> confirm plan.
3. Build slices -> Testing (full suite) -> local preview reachable + Playwright verifies it.
4. Deploy gate -> delivery report -> final acceptance -> `Delivered`.

Fix any break you hit. Re-run until it completes cleanly.

Verify: the golden path reaches `Delivered` with no manual database edits and no skipped checks.

### Task 11.2 — Acceptance checklist (spec §18)

Tick every item from spec §18. For each, demonstrate it:
- [ ] Create a project from a simple web-app requirement.
- [ ] Requirement group: analysis, scoring, gap questioning, PRD.
- [ ] Requirement loop terminates on its own (budget/stuck) and shows the stuck gate.
- [ ] Human confirms requirement + tech plan via option cards + custom input.
- [ ] Dev group implements slices and records agent events.
- [ ] Per-slice retry budget enforced; Slice Failure gate appears when exhausted.
- [ ] Tests generated and run: per-slice checks + final full suite.
- [ ] Generated app previewable before deployment; Playwright verifies the preview URL.
- [ ] Dockerfile/Compose + run instructions generated.
- [ ] Delivery report complete.
- [ ] High-risk ops require confirmation and are logged.
- [ ] Command logs retained with secret redaction + large-output artifact chunking.
- [ ] `Failed` and `Paused` are reachable via their transitions.
- [ ] Final user acceptance captured.
- [ ] No unresolved high-risk issue remains.

### Task 11.3 — Logging + safety audit

Confirm full retention (spec §8.2): tool calls, command + terminal output, diffs, test results, deploy logs, gate decisions, failures, change requests. Confirm redaction works and large outputs are chunked into artifacts with DB metadata only. Try to make a secret leak; confirm it does not.

Verify: a deliberate secret in a command is redacted everywhere; a huge output is stored as an artifact file, not a DB blob.

### Task 11.4 — Status-machine reachability

Confirm every terminal and cross-cutting transition is reachable: drive a project to `Failed` (via a fail gate), and to `Paused` and back (via pause/resume). Confirm illegal transitions are still rejected.

Verify: `Failed`, `Paused`, and resume all work; an illegal transition throws.

### Task 11.5 — Risk + sandbox regression

Re-test the §12 grading: low/medium run locally; containable high goes to the sandbox after a gate; deploy/tunnel run on the real machine after a gate; unknown commands default to high; `npm install` (unpinned) is high.

Verify: each risk level behaves per the table.

## Verification

```bash
pnpm -w typecheck && pnpm -w test && pnpm -w build
# full golden-path integration run reaches Delivered
# safety: secret redaction holds; large output chunked
# reachability: Failed + Paused + resume; illegal transition rejected
```

## Definition of Done

- [ ] The golden path runs end to end to `Delivered` with no manual fixes mid-run.
- [ ] Every spec §18 checklist item is demonstrated true.
- [ ] Logging is complete, redaction holds, large outputs are chunked.
- [ ] `Failed` and `Paused` reachable; illegal transitions rejected.
- [ ] Risk grading + sandbox behave per §12.
- [ ] No unresolved high-risk issue remains.

## Do Not

- Do not fake any acceptance item. If something is not really working, fix it, do not check the box.
- Do not weaken risk grading or redaction to make a test pass.

## Output

- An MVP that satisfies spec §18: a user can turn one sentence into a runnable, previewable, deliverable web app, with human gates, safe execution, full logging, and a delivery report.
