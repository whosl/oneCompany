# Phase M10 — Deployment, Delivery, Change Requests

## Goal

Expose the app behind a deployment gate (Cloudflare Tunnel), generate the full delivery report and artifacts, and finish the user-initiated change-request flow.

## Prerequisites

- M4 (gates), M6 (Change Review handling started), M7 (preview + tests), M8 (Report tab) done.

## Concepts You Need

- Deployment is high-risk and gated (spec §16, §12). The tunnel runs on the REAL machine/network, NOT the sandbox (spec §12, M5).
- MVP tunnel mode: the user provides and runs the tunnel; the system uses the URL (spec §16). Token automation is future scope.
- Delivery report (spec §17): must include all listed sections, and risks must include forced-continue decisions, approved acceptance-scope changes from skip-slice requests, and skip-risk decisions.
- Change requests (spec §5.4, R4): a user requirement change after the tech plan, OR a skip-slice request, both go through `Change Review` and update the plan/acceptance criteria. A required feature is never silently waived.
- Secrets (spec §12): never log API keys; if a needed third-party key is missing, agents generate mock data and clearly prompt the user.

## Spec References

`spec.md` §16, §17, §5.4, §3.1 (Change Review, Deploying), §12.

## Tasks

### Task 10.1 — Deployment gate + tunnel

- Add a deployment flow: when status is `Deploying` (from M7), raise the `deployment` gate (M4). Only after approval, expose the URL.
- Support a user-provided Cloudflare Tunnel: the user supplies/runs the tunnel; store the resulting URL in `deployments` and `DevState.deploymentUrl`.
- The tunnel command is `high_deploy` risk: gated, run on the real machine/network (not sandbox).
- After the URL is exposed and confirmed -> set status `Awaiting Acceptance`.

Verify: a passing project reaches `Deploying`, shows a deployment gate, and after approval stores a deployment URL and moves to `Awaiting Acceptance`.

### Task 10.2 — Change request flow (finish)

Complete `Change Review` (started in M6):
- `change_requests` rows + `change_request.created` / `change_request.resolved` events.
- A user requirement change after the tech plan: analyze impact on PRD, acceptance criteria, data model, tests, and code; identify affected commits and rollback options (use git from M5); then route `Change Review -> Developing` (queue-only change) or `Change Review -> Tech Plan Review` (architecture change).
- A skip-slice request (from M6): update PRD + acceptance criteria, or keep the criterion blocking. Never a silent waiver.

Verify: a mid-development requirement change creates a change request, routes correctly, and updates the plan; a skip request updates acceptance criteria.

### Task 10.3 — Delivery report generator

Create the report (DevOps & Delivery agent + a generator) covering ALL spec §17 sections: requirement summary, confirmed tech stack, feature list, directory structure, run instructions, test results, deployment URL, risks and limitations (including forced-continue, approved skip-slice scope changes, and skip-risk decisions), and follow-up recommendations. Write it to `artifacts/` and emit `artifact.created`.

Verify: a finished project produces a complete delivery report file with every §17 section, and the risks section lists any forced-continue / skip decisions.

### Task 10.4 — Final acceptance gate

When status is `Awaiting Acceptance`, raise the `final_acceptance` gate (M4):
- `accept` -> status `Delivered`.
- `reject_and_redo` -> status `Developing`.

Verify: accepting moves to `Delivered`; rejecting returns to `Developing`.

### Task 10.5 — Secrets / mock data

Ensure: missing required third-party API key -> agents generate mock data and clearly prompt the user for the key; keys never appear in logs/artifacts/stream (reuses M5 redaction).

Verify: with a missing key, the app still runs on mock data and the user is prompted; no key value appears anywhere in logs.

## Verification

```bash
pnpm -w typecheck && pnpm -w test
# integration: passing project -> deployment gate -> tunnel URL -> Awaiting Acceptance -> final_acceptance -> Delivered
# integration: mid-dev change request -> Change Review -> plan updated
# manual: open Report tab -> full delivery report with all sections
```

## Definition of Done

- [ ] Deployment is gated; tunnel URL stored; runs on real machine (not sandbox); then `Awaiting Acceptance`.
- [ ] Change requests (requirement change + skip-slice) route through Change Review and update plan/acceptance; no silent waivers.
- [ ] Delivery report includes every §17 section and records forced-continue / skip-slice / skip-risk decisions in risks.
- [ ] Final acceptance gate -> `Delivered` or back to `Developing`.
- [ ] Missing API key -> mock data + user prompt; secrets never logged.

## Do Not

- Do not expose a deployment URL without the deployment gate.
- Do not run the tunnel in the sandbox.
- Do not silently drop a required feature on skip.
- Do not put any secret value in the report, logs, artifacts, or stream.

## Output

- A deployable, delivered project: deployment URL + full delivery report + working change flow. Ready for final hardening in M11.
