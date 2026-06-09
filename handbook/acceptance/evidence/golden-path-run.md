# Golden path acceptance evidence — M11

Date: 2026-06-10

## Stub engine (local, automated)

Command:

```bash
pnpm --filter @oc/api vitest run src/integration/m10-golden-path.test.ts
```

Result: **passed** — `Testing → Deploying → deployment gate → Awaiting Acceptance → final_acceptance → Delivered`

Covers §18 checklist items tied to deployment, delivery report, and final acceptance without LLM keys.

## Real engine (integration)

Test file: `apps/api/src/integration/golden-path.test.ts`  
Case: `runs one sentence through delivery to Delivered with artifacts and gate events`

Requires: `OC_OPENCODE_INTEGRATION=1`, `OPENAI_API_KEY` or `OC_LLM_*`, `opencode` CLI.

CI: `.github/workflows/opencode-integration.yml` — weekly Monday 06:00 UTC + `workflow_dispatch`, `continue-on-error: true` until secrets are stable enough for a required check.

Local full run:

```bash
source .env   # keys must be present
OC_OPENCODE_INTEGRATION=1 pnpm --filter @oc/api vitest run src/integration/golden-path.test.ts \
  -t "runs one sentence through delivery to Delivered"
```

## Related automated probes

| §18 area | Probe | Status |
| --- | --- | --- |
| Create project | `golden-path.test.ts` / projects API | automated |
| Requirement → PRD | `packages/workflow/src/requirement/graph.test.ts` | automated |
| Stuck gate | `packages/workflow/src/requirement/stuck-gate.test.ts` (4 tests) | automated |
| Full workspace | `pnpm -w test` (2026-06-10) | passed |
