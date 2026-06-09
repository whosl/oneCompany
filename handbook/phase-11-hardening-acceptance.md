# Phase M11 — Hardening & MVP Acceptance

## Goal

Prove the whole product meets every MVP acceptance criterion in spec §18, on a real sample app, end to end.

## Prerequisites

- M0–M10 done.

## Concepts You Need

- This phase adds little new code. It runs the full system, finds gaps, and fixes them.
- The bar is spec §18. Every bullet there must be true and demonstrated.
- TDD focus: when a gap is found, first add a failing regression test that reproduces it, then fix the implementation. Do not patch acceptance failures without locking them into the suite.

## Spec References

`spec.md` §18, §8.2, §3.1, §12.

## Tasks

### Task 11.1 — Golden-path end-to-end run

Start red where possible: create or update the golden-path E2E so it fails on the missing behavior before fixing the product.

Drive one small real requirement (for example: "a to-do web app") from one sentence all the way to `Delivered`:
1. Create project -> requirement loop -> PRD + acceptance.
2. Confirm requirement -> tech plan -> confirm plan.
3. Build slices -> Testing (full suite) -> local preview reachable + Playwright verifies it.
4. Deploy gate -> delivery report -> final acceptance -> `Delivered`.

Fix any break you hit. Re-run until it completes cleanly.

Verify: the golden path reaches `Delivered` with no manual database edits and no skipped checks.

### Task 11.2 — Acceptance checklist (spec §18)

Tick every item from spec §18. For each, demonstrate it:
- [x] Create a project from a simple web-app requirement.
- [x] Requirement group: analysis, scoring, gap questioning, PRD.
- [x] Requirement loop terminates on its own (budget/stuck) and shows the stuck gate.
- [x] Human confirms requirement + tech plan via option cards + custom input.
- [x] Console matches the Figma baseline: top nav, Stream Mode user cards + sticky composer, Swimlane switcher, five right tabs, avatar Settings, and project-switcher Project Hub.
- [x] Dev group implements slices and records agent events.
- [x] Per-slice retry budget enforced; Slice Failure gate appears when exhausted.
- [x] Tests generated and run: per-slice checks + final full suite.
- [x] Generated app previewable before deployment; Playwright verifies the preview URL.
- [x] Dockerfile/Compose + run instructions generated.
- [x] Delivery report complete.
- [x] High-risk ops require confirmation and are logged.
- [x] Command logs retained with secret redaction + large-output artifact chunking.
- [x] `Failed` and `Paused` are reachable via their transitions.
- [x] Final user acceptance captured.
- [x] No unresolved high-risk issue remains.

### Task 11.3 — Logging + safety audit

Start red: add regression tests for any discovered redaction, chunking, or retention failure before fixing it.

Confirm full retention (spec §8.2): tool calls, command + terminal output, diffs, test results, deploy logs, gate decisions, failures, change requests. Confirm redaction works and large outputs are chunked into artifacts with DB metadata only. Try to make a secret leak; confirm it does not.

Verify: a deliberate secret in a command is redacted everywhere; a huge output is stored as an artifact file, not a DB blob.

### Task 11.4 — Status-machine reachability

Confirm every terminal and cross-cutting transition is reachable: drive a project to `Failed` (via a fail gate), and to `Paused` and back (via pause/resume). Confirm illegal transitions are still rejected.

Verify: `Failed`, `Paused`, and resume all work; an illegal transition throws.

### Task 11.5 — Risk + sandbox regression

Re-test the §12 grading: low/medium run locally; containable high goes to the sandbox after a gate; deploy/tunnel run on the real machine after a gate; unknown commands default to high; `npm install` (unpinned) is high.

Verify: each risk level behaves per the table.

### Task 11.6 — Figma UI baseline regression

Start red: add browser/visual regression tests for any missing or overlapping required UI surface before adjusting styles.

Compare the implemented console against the Figma file `OneCompany Console - Claude Style Draft` and spec §14:
- Stream Mode shows user-originated messages, agent events, inline gates, collapsed verbose details, and a sticky user composer.
- Swimlane Mode renders the same projection as agent x Plan/Act/Observe/Reflect, with user/gate markers still discoverable.
- Right panel has exactly Files / Preview / Terminal / Tests / Report.
- Settings opens from avatar and contains only global environment/secrets/readiness.
- Project Hub opens from the project switcher and manages multiple projects.
- The UI uses the Claude-inspired warm console tokens and does not drift into the excluded crowded layout.

Verify: manual visual pass plus browser screenshots for desktop and a narrow viewport show no clipped text, overlapping controls, or missing required surfaces.

### Task 11.7 — Stream §14.3.1 presentation polish (deferred from M9)

Start red: add stream renderer tests for each deferred behavior before implementing.

Complete the M9-deferred §14.3.1 stream refinements (presentation only; same `ConsoleProjection`):

- Run grouping in the stream by `runId` / `agentId` / `correlationId`.
- Plan/Act/Observe/Reflect collapsible segments inside the stream (active expanded, completed collapsed). Today only the swimlane shows P/A/O/R.
- Newest-at-bottom feed with pin-to-bottom auto-scroll.
- Large tool output folded to artifact links (today only "open in Terminal").
- Tool-call rows expandable to args/result.

Keep the inline `GateCard` (stream) and the gate buttons in the sticky composer as two intentional surfaces; do not remove either.

Verify: stream renderer tests cover grouping, collapse, scroll behavior, artifact links, and expandable tool calls; switching stream ↔ swimlane remains lossless.

## Verification

```bash
pnpm -w typecheck && pnpm -w test && pnpm -w build
# full golden-path integration run reaches Delivered
# safety: secret redaction holds; large output chunked
# reachability: Failed + Paused + resume; illegal transition rejected
# UI: Stream composer, Settings, Project Hub, Swimlane, and right tabs verified against Figma baseline
```

## Definition of Done

- [x] The golden path runs end to end to `Delivered` with no manual fixes mid-run (stub + real-engine test; see `handbook/acceptance/evidence/golden-path-run.md`).
- [x] Every spec §18 checklist item is demonstrated true (`handbook/acceptance/section-18-checklist.md`).
- [x] Logging is complete, redaction holds, large outputs are chunked.
- [x] `Failed` and `Paused` reachable; illegal transitions rejected.
- [x] Risk grading + sandbox behave per §12.
- [x] Figma UI baseline surfaces and visual constraints are verified (Playwright + screenshots).
- [x] Deferred M9 stream §14.3.1 polish (Task 11.7) is complete.
- [x] No unresolved high-risk issue remains (`handbook/acceptance/evidence/audit-signoff.md`).
- [x] Every hardening fix is backed by a regression test or an explicit acceptance/E2E assertion that failed before the fix.

## Do Not

- Do not fake any acceptance item. If something is not really working, fix it, do not check the box.
- Do not weaken risk grading or redaction to make a test pass.
- Do not accept a manual-only fix for a repeatable bug; add a regression test first.

## Output

- An MVP that satisfies spec §18: a user can turn one sentence into a runnable, previewable, deliverable web app, with human gates, safe execution, full logging, and a delivery report.
