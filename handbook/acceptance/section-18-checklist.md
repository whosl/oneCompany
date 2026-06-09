# MVP Acceptance Checklist — spec §18

Status: **pending** (fill during M11 Task 11.8)

Use this file as the human sign-off record alongside automated probes in `apps/api/src/acceptance/section-18.test.ts`.

| # | Criterion | Probe / evidence | Status | Notes |
|---|-----------|------------------|--------|-------|
| 1 | Create project from a simple web app requirement | `golden-path.test.ts` step 1 | [ ] | |
| 2 | Requirement group: analysis, scoring, gap questioning, PRD | golden path + M3 tests | [ ] | |
| 3 | Requirement loop terminates (budget/stuck) + stuck gate | `stuck-gate.test.ts` / golden path | [ ] | |
| 4 | Human confirms requirement (option cards + custom) | `requirement_confirm` gate (M11 11.2a) | [ ] | |
| 5 | Human confirms technical plan | `tech_plan_confirm` in golden path | [ ] | |
| 6 | Console matches Figma baseline | Playwright `console-baseline.spec.ts` + screenshots | [ ] | |
| 7 | Dev group implements slices + records agent events | events: `agent.*`, `tool_call.*` | [ ] | |
| 8 | Per-slice retry budget + slice failure gate | `slice-failure-gate.test.ts` | [ ] | |
| 9 | Tests: per-slice checks + final full suite | `test_results` + testing phase | [ ] | |
| 10 | App locally previewable; Playwright verifies preview URL | preview + `final:playwright` | [ ] | |
| 11 | Dockerfile/Compose + run instructions generated | `docker-artifacts.test.ts` | [ ] | |
| 12 | Delivery report complete | `report-generator.test.ts` / golden path | [ ] | |
| 13 | High-risk ops require confirmation + logged | `risk.regression.test.ts` | [ ] | |
| 14 | opencode under full governance + authoritative tests | M9.5 + `authorize-integration` | [ ] | |
| 15 | Command logs redacted + large-output chunked | `logging-audit.test.ts` | [ ] | |
| 16 | `Failed` and `Paused` reachable | `projects-failed` + `projects-pause` | [ ] | |
| 17 | Final user acceptance captured | `final_acceptance` gate | [ ] | |
| 18 | No unresolved high-risk issue remains | M11 audit sign-off | [ ] | |

## Evidence attachments

- Real-engine golden path log: _(CI artifact URL or local run date)_
- Figma comparison screenshots: `handbook/acceptance/evidence/`
- Manual narrow-viewport pass: _(date / reviewer)_
