# Phase M7 — Testing & QA Integration + Local Preview

## Goal

Run real tests and start a local preview of the generated app. Keep per-slice checks (inside the dev loop) separate from the final app-wide acceptance suite (the `Testing` phase).

## Prerequisites

- M5 done (shell executor, sandbox). M6 done (slices produce code and commits).

## Concepts You Need

- Two kinds of checks (spec §5.5, §15):
  - Per-slice checks: a scoped subset run during the M6 loop (already built in M6).
  - Final acceptance suite: the full app-wide run during the `Testing` phase — unit + integration + typecheck + build + Playwright E2E + acceptance cases.
- Testing phase transitions (spec §3.1): `Developing -> Testing` when all slices accepted; `Testing -> Developing` if the full suite fails; `Testing -> Deploying` if it passes and deployment is requested; else `Testing -> Awaiting Acceptance`.
- Local preview (spec §15, §16): the generated app must actually start and be reachable at a local URL. Playwright verifies that same URL. Preview must work BEFORE any deployment.
- TDD focus: write failing tests for runner result parsing, preview lifecycle, `test_results` persistence, status routing, and Playwright artifact handling before implementing the testing phase.

## Spec References

`spec.md` §15, §5.5, §3.1 (Testing), §16 (preview part).

## Tasks

### Task 7.1 — Test runners

Start red: write parser tests using sample Vitest/typecheck/build/Playwright outputs before implementing the runners.

Create `packages/workspace/src/test-runner.ts` with functions that run inside the generated project via M5 `runCommand` and parse results:
- `runVitest()` — unit + integration.
- `runTypecheck()` — `tsc --noEmit` (or the project's typecheck).
- `runBuild()` — the project build command.
- `runPlaywright()` — browser E2E; save screenshots/traces to `artifacts/`.

Each returns a normalized result: suite name, passed/failed counts, status, and an artifact ref for logs.

Verify: each runner runs against a sample generated app and returns a normalized result.

### Task 7.2 — Local preview server

Start red: write a preview lifecycle test for start -> reachable URL -> stored state -> stop.

Create `packages/workspace/src/preview.ts`:
- `startPreview(projectId)` -> start the generated app's dev/preview server, capture the local URL, store it in `DevState.previewUrl`, and emit an event/artifact.
- `stopPreview(projectId)` -> stop it.
- Treat starting a local service as Medium risk (run locally, log) per §12.

Verify: `startPreview` returns a reachable local URL (an HTTP GET to it succeeds).

### Task 7.3 — Record results

- Write each run to `test_results`; emit `test.result` per suite with status `passed` / `failed`.

Verify: running a suite writes a `test_results` row and emits `test.result`.

### Task 7.4 — Testing phase flow

Start red: write status-routing tests for all-green -> forward and forced failure -> `Developing`.

When M6 reports all slices accepted, set status `Testing` and run the FULL suite app-wide:
- Run typecheck + build + Vitest + Playwright E2E + acceptance cases.
- Playwright runs against the local preview URL from Task 7.2.
- If anything fails -> set status `Developing` (back to fixing).
- If all pass -> if deployment requested set `Deploying` (handled in M10), else set `Awaiting Acceptance`.

Verify: with all slices done, the Testing phase runs the full suite; a forced failure returns to `Developing`; all-green moves forward.

### Task 7.5 — QA agent loop

Wire the `qa` agent (from M6) to: read results, request fixes for failures (loop back to Developing), and confirm the preview is actually reachable and usable (not just built).

Verify: a failing E2E causes the QA agent to request a fix and the status returns to `Developing`.

## Verification

```bash
pnpm -w typecheck && pnpm -w test
# integration: all slices done -> Testing -> full suite runs against preview URL
# integration: failing suite -> back to Developing; passing -> Awaiting Acceptance (no deploy)
# manual: GET the preview URL succeeds; Playwright hits the same URL
```

## Definition of Done

- [ ] Vitest, typecheck, build, and Playwright runners work and return normalized results.
- [ ] `startPreview` yields a reachable local URL stored in `DevState.previewUrl`.
- [ ] Results written to `test_results` and emitted as `test.result`.
- [ ] The `Testing` phase runs the FULL app-wide suite, separate from per-slice checks.
- [ ] Testing failure -> `Developing`; pass -> `Deploying` (if requested) or `Awaiting Acceptance`.
- [ ] Playwright verifies the same preview URL the Preview tab will use.
- [ ] Runner parsing, preview lifecycle, result persistence, artifact storage, and Testing status routing are covered by tests that failed before implementation.

## Do Not

- Do not merge per-slice checks and the final suite. They are separate (spec §5.5).
- Do not attempt deployment before a working local preview exists.
- Do not mark Testing passed if any suite failed.
- Do not rely on command exit codes alone when structured reporter output is available; parse and persist normalized results.

## Output

- Test runners + normalized results (used by the Tests tab in M8).
- A local preview URL (used by the Preview tab in M8 and by deployment in M10).
