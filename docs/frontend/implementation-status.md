# UI v2 Implementation Status

Last updated: 2026-06-10

This document records implementation reality. Product and interaction contracts remain in the other frontend documents; this file answers what is implemented now, what has been verified, and what should be built next.

## Current Entry Points

| Entry                    | Data source                | Purpose                             |
| ------------------------ | -------------------------- | ----------------------------------- |
| `/dev/ui-v2`             | Complete fixture           | Visual QA and interaction reference |
| `/projects/[id]?ui=v2`   | Real snapshot + SSE + APIs | Opt-in live UI v2                   |
| `NEXT_PUBLIC_OC_UI_V2=1` | Real snapshot + SSE + APIs | Environment-level UI v2 default     |
| `/projects/[id]`         | Legacy console by default  | Fallback until rollout acceptance   |

## Completed

### Projection And Reliability

- Snapshot events are deduplicated by `eventId` and sorted by `seq`.
- Snapshot hydration does not move the SSE cursor backwards.
- `agent.started`, `agent.reflect`, `agent.error`, `run.failed`, change request, deployment, report, artifact, missing environment key and status change events are projected.
- Composer mode is derived from project status and blocking gate.
- Delivered, Failed and Paused derive read-only or disabled composer states.

### UI v2 Integration

- `apps/web/src/components/ui-v2/adapter.ts` converts `ConsoleProjection` into the UI v2 view model.
- `apps/web/src/components/ui-v2/ui-v2-console.tsx` owns live API actions.
- Fixture and live modes use the same `UiV2Shell`.
- Live UI supports Stream / Swimlane switching and selected run retention.
- Stream separates Current Work, grouped Run History and strict event-only Event History.
- Historical runs are grouped by agent group, collapsed by default and incrementally revealed.
- Event History renders by ascending `seq`, starts with the latest 30 events and can load earlier events in batches.
- Stream and Swimlane restore their own scroll positions when switching modes.
- Blocking gate options come from the snapshot projection.
- Live UI supports pause/resume, deploy, requirement input, question answers, change requests, deployment URL and gate decisions.
- Files, Preview, Terminal, Tests and Report use the existing real API-backed tab components.

### Verified

- `pnpm --filter @oc/web lint`
- `pnpm --filter @oc/web typecheck`
- `pnpm --filter @oc/web test`
- 23 test files and 48 tests passing as of this update.
- Real Developing project rendered with a `slice_failure` gate.
- Desktop viewport: 1440 x 900.
- Mobile viewport: 390 x 844.
- Stream / Swimlane and workspace tab switching verified.
- No page-level horizontal overflow on mobile.
- No browser console errors after duplicate-key fixes.

## Partial Or Transitional Areas

| Area            | Current implementation                                           | Remaining issue                                                                     |
| --------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Stream          | Separates requirement, Current Work, grouped runs and strict event history | Remaining work is scenario coverage for every project and gate state                |
| Run history     | Grouped and collapsed with bounded incremental expansion          | True virtualization can be added later if production histories exceed current bounds |
| Swimlane        | P/A/O/R cells, status and selected run detail work               | Group hierarchy, markers, retry/paused/interrupted states and chip links incomplete |
| Composer        | Projection-driven mode and live APIs work                        | Question-round UX is currently text-based; Paused global mutation audit remains     |
| Right Workspace | All five real API components are embedded                        | Content styling still reflects legacy components                                    |
| Top Nav         | Status, group, progress, blocker, pause and deploy exist         | Settings/Hub entries and deploy disabled reason missing                             |
| Fixtures        | Main UI fixture and adapter tests exist                          | Full 12-status and all-gate scenario matrix missing                                 |
| Rollout         | Query and environment opt-in work                                | UI v2 is not yet the default route                                                  |

## Next Queue

1. Scenario fixtures: all statuses, gates, multi-gate, paused, failed and delivered.
2. State safety: audit Paused mutations and terminal read-only behavior.
3. Swimlane completion: group hierarchy, markers, deep links and interrupted/retrying states.
4. Component foundation: extract repeated UI primitives and align real workspace tab styling.
5. Top-level workflows: Project Hub, Settings and Integrations UI v2.
6. Visual regression and default-route rollout.

## Known Risks

- Very large production projects may eventually need windowed virtualization beyond the current bounded incremental rendering.
- `CurrentWork` is currently an explicit UI v2 adapter contract; the scenario-matrix work should decide whether it belongs in the canonical `ConsoleProjection` type.
- Live Right Workspace behavior is reliable, but visual consistency will remain mixed until the legacy tab internals are restyled.
- UI v2 must not become the default until Paused, terminal gate handling and all terminal project states have dedicated tests.
