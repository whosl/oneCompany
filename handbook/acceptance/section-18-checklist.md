# MVP Acceptance Checklist — spec §18

Status: **signed off** — automated probes + Playwright baseline + evidence (2026-06-10)

Use this file as the human sign-off record alongside automated probes in `apps/api/src/acceptance/section-18.test.ts`.

| # | Criterion | Probe / evidence | Status | Notes |
|---|-----------|------------------|--------|-------|
| 1 | Create project from a simple web app requirement | `golden-path.test.ts` / projects API | [x] | `evidence/golden-path-run.md` |
| 2 | Requirement group: analysis, scoring, gap questioning, PRD | `graph.test.ts` + golden-path | [x] | M3 + integration |
| 3 | Requirement loop terminates (budget/stuck) + stuck gate | `stuck-gate.test.ts` | [x] | 4 tests green |
| 4 | Human confirms requirement (option cards + custom) | `requirement-confirm.test.ts` | [x] | automated |
| 5 | Human confirms technical plan | `tech_plan_confirm` in golden path | [x] | integration |
| 6 | Console matches Figma baseline | Playwright `console-baseline.spec.ts` + screenshots | [manual] | `evidence/console-*.png` 2026-06-10 |
| 7 | Dev group implements slices + records agent events | events: `agent.*`, `tool_call.*` | [x] | integration |
| 8 | Per-slice retry budget + slice failure gate | `slice-failure-gate.test.ts` | [x] | automated |
| 9 | Tests: per-slice checks + final full suite | `test_results` + testing phase | [x] | automated |
| 10 | App locally previewable; Playwright verifies preview URL | preview + `final:playwright` | [x] | integration |
| 11 | Dockerfile/Compose + run instructions generated | `docker-artifacts.test.ts` | [x] | automated |
| 12 | Delivery report complete | `report-generator.test.ts` / golden path | [x] | automated |
| 13 | High-risk ops require confirmation + logged | `risk.regression.test.ts` | [x] | automated |
| 14 | opencode under full governance + authoritative tests | M9.5 + `requirement/deps.test.ts` | [x] | automated |
| 15 | Command logs redacted + large-output chunked | `logging-audit.test.ts` | [x] | automated |
| 16 | `Failed` and `Paused` reachable | `projects-failed` + `projects-pause` | [x] | automated |
| 17 | Final user acceptance captured | `final_acceptance` gate | [x] | automated |
| 18 | No unresolved high-risk issue remains | M11 audit sign-off | [x] | `evidence/audit-signoff.md` |

## Evidence attachments

- Golden path: [`evidence/golden-path-run.md`](./evidence/golden-path-run.md)
- Figma / console baseline: [`evidence/console-desktop.png`](./evidence/console-desktop.png), [`evidence/console-narrow.png`](./evidence/console-narrow.png)
- Audit: [`evidence/audit-signoff.md`](./evidence/audit-signoff.md)
- Real-engine CI: `.github/workflows/opencode-integration.yml` (weekly + manual dispatch)
