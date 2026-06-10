# UI v2 Implementation Status

Last updated: 2026-06-10

This document records implementation reality. Product and interaction contracts remain in the other frontend documents; this file answers what is implemented now, what has been verified, and what should be built next.

## Current Entry Points

| Entry                    | Data source                | Purpose                             |
| ------------------------ | -------------------------- | ----------------------------------- |
| `/dev/ui-v2`             | Complete fixture           | Visual QA and interaction reference |
| `/dev/ui-v2?scenario=*`  | Scenario snapshot          | Status, gate and edge-case regression |
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
- Scenario fixtures cover all 12 project statuses, all 8 gate types and multiple open gates.

### UI v2 Integration

- `apps/web/src/components/ui-v2/adapter.ts` converts `ConsoleProjection` into the UI v2 view model.
- `apps/web/src/components/ui-v2/ui-v2-console.tsx` owns live API actions.
- Fixture and live modes use the same `UiV2Shell`.
- Live UI supports Stream / Swimlane switching and selected run retention.
- Stream separates Current Work, grouped Run History and strict event-only Event History.
- Historical runs are grouped by agent group, collapsed by default and incrementally revealed.
- Event History renders by ascending `seq`, starts with the latest 30 events and can load earlier events in batches.
- Stream and Swimlane restore their own scroll positions when switching modes.
- Swimlane groups runs by Requirement / Development ownership with active and failed groups expanded.
- Swimlane cells use two-line deterministic display summaries while preserving full P/A/O/R text in selected-run detail.
- User and gate events remain visible as timeline markers; tool, diff, test and report markers deep-link to the workspace.
- Selected-run detail includes the source event sequence range.
- Blocking gate options come from the snapshot projection.
- Live UI supports pause/resume, deploy, requirement input, question answers, change requests, deployment URL and gate decisions.
- Files, Preview, Terminal, Tests and Report use the existing real API-backed tab components.
- UI v2 now shares buttons, icon buttons, tabs, panels, status pills, inputs, empty states and code/log surfaces through local primitives.
- All five real Workspace tabs use the UI v2 component language while preserving their existing APIs and read-only/governed behavior.
- Terminal gate decisions now load options from the open-gates API by `gateId`; the frontend no longer guesses options from `gateType`.
- Project Hub and Settings are reachable from the UI v2 top navigation; opening another project preserves `?ui=v2`.
- Paused displays a global banner, projects the active run as `interrupted`, and disables composer, gate and deploy mutations.
- Deploy is enabled only during Testing; Draft, Delivered and Failed cannot be paused.
- Query and environment UI v2 route switches have dedicated tests.

### Verified

- `pnpm --filter @oc/web lint`
- `pnpm --filter @oc/web typecheck`
- `pnpm --filter @oc/web test`
- 27 test files and 66 tests passing as of this update.
- Real Developing project rendered with a `slice_failure` gate.
- Desktop viewport: 1440 x 900.
- Mobile viewport: 390 x 844.
- Stream / Swimlane and workspace tab switching verified.
- No page-level horizontal overflow on mobile.
- No browser console errors after duplicate-key fixes.
- Browser scenarios verified for Paused, multiple open gates and Delivered; Paused Stream/Swimlane switching produced no new console errors.
- Real-project Swimlane verified on desktop and 390px mobile; cell summaries are capped at 36 characters and workspace deep links were exercised.
- Slice 6 browser QA exercised all five Workspace tabs plus Settings and Project Hub on the real project.
- The 390 x 844 viewport has no page-level horizontal overflow; Workspace tabs remain present and browser console error/warn logs are empty.

## Partial Or Transitional Areas

| Area            | Current implementation                                           | Remaining issue                                                                     |
| --------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Stream          | Separates requirement, Current Work, grouped runs and strict event history | Core status and gate scenarios are covered; richer per-status content remains        |
| Run history     | Grouped and collapsed with bounded incremental expansion          | True virtualization can be added later if production histories exceed current bounds |
| Swimlane        | Grouped P/A/O/R, compact summaries, markers, deep links and event refs work | `retrying` still needs an authoritative backend signal                              |
| Composer        | Projection-driven mode, live APIs and Paused safety work         | Question-round UX is currently text-based                                            |
| Right Workspace | All five real API components use UI v2 primitives and token styling | Richer artifact version browsing remains                                             |
| Top Nav         | Status, group, progress, blocker, guarded actions, Settings and Hub exist | Full Hub/Settings content redesign remains                                           |
| Fixtures        | Main fixture plus 12-status, 8-gate and multi-gate matrix exist  | Retry state needs an authoritative backend signal                                   |
| Rollout         | Query and environment opt-in work                                | UI v2 is not yet the default route                                                  |

## Next Queue

1. Redesign Project Hub, Settings and Integrations content in UI v2.
2. Add the backend `displaySummary` / retry-attempt contract and optional asynchronous small-model backfill.
3. Add visual regression baselines and make UI v2 the default route after acceptance.

## Known Risks

- Very large production projects may eventually need windowed virtualization beyond the current bounded incremental rendering.
- `CurrentWork` remains an explicit UI v2 adapter contract until the backend exposes a durable current-work snapshot.
- `retrying` cannot be projected honestly until snapshot or events expose attempt/retry state; the UI must not infer it from a failed event alone.
- Current short summaries use a deterministic fallback. Agent-native `displaySummary` and small-model backfill are documented but not yet emitted by the backend.
- Project Hub and Settings are functionally reachable from UI v2, but their modal content still uses the transitional legacy information layout.
- UI v2 should not become the default until Swimlane markers, workspace styling and visual regression coverage are complete.
