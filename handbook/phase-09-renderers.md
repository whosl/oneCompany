# Phase M9 — Info Stream + Swimlane Renderers

## Goal

Build the left panel: the default information stream and a switch to swimlane mode. Both are two views over the SAME data (events + current state). Also build the top nav and the overall layout.

## Prerequisites

- M1 done (events + SSE). M2 done (agents emit P/A/O/R + failure events). Gate cards from M4 and tabs from M8 plug into this layout.

## Concepts You Need

- One source, two renderers (spec §8, §14.4): the information stream and the swimlane read the same event projection + current durable-state snapshot. There is NO separate state store for each view. Switching views must not change the data.
- Information stream (spec §14.3): a chronological feed. Verbose details collapsed by default.
- Swimlane (spec §14.4): rows = agents, columns = Plan / Act / Observe / Reflect. Failed/retry cells are driven by `agent.error` / `run.failed` / `tool_call.failed` events.
- Layout (spec §14.1, §20): top nav + resizable left/right split; default left 42–46%, right 54–58%.
- Top nav (spec §14.2): project switcher, status, phase, active agent group, run/pause, deploy entry, avatar dropdown (settings live here).

## Spec References

`spec_0.2.md` §14.1, §14.2, §14.3, §14.4, §8, §20.

## Tasks

### Task 9.1 — Event projection (shared)

Create one client-side store that subscribes to the SSE stream and builds a projection: the ordered event list plus a derived "current snapshot" (status, phase, active agents, latest P/A/O/R per agent, open gates). Both renderers read from THIS store only.

Verify: a unit/integration test feeds a known event sequence and asserts the projection (e.g., latest plan summary for an agent).

### Task 9.2 — Layout shell

Build the main layout: top nav across the top; below it a resizable left/right split (default left ~44%, right ~56%). The right side hosts the M8 tabs; the left side hosts the renderer (Task 9.4/9.5).

Verify: the layout renders, the split is draggable, defaults match spec.

### Task 9.3 — Top nav

Build the top nav with: project switcher, current status, current phase, active agent group indicator, run/pause control, deployment entry, and an avatar dropdown. Put Settings inside the avatar dropdown (local workspace path, API key status, Cloudflare Tunnel config, environment checks). Do NOT expose model routing settings (spec §14.2).

Verify: the nav shows live status/phase from the projection; switching projects works; settings open from the avatar.

### Task 9.4 — Information stream renderer

Render the projection as a chronological feed: user requirement + answers, completeness score, agent events in order, P/A/O/R summaries, tool calls, command output, diffs, test results, human gate cards (reuse M4 `GateCard`), and risk warnings. Collapse verbose details by default (spec §14.3).

Verify: events appear in order; verbose blocks are collapsed but expandable; a raised gate shows its card inline.

### Task 9.5 — Swimlane renderer

Add a button to switch the left panel to swimlane mode. Render the SAME projection as a grid: rows = agents, columns = Plan/Act/Observe/Reflect. Active cells emphasized, completed cells compact, failed cells show risk/retry (from failure events). Switching back and forth must not lose or change data (spec §14.4).

Verify: switching to swimlane shows the same underlying events arranged by agent x phase; failed cells appear when failure events exist; switching back is lossless.

## Verification

```bash
pnpm -w typecheck && pnpm -w test
# manual: run a workflow; watch the info stream update live; switch to swimlane -> same data, different layout
# manual: top nav status/phase update; run/pause control reflects status
```

## Definition of Done

- [ ] A single projection store feeds both renderers (no per-view state store).
- [ ] Layout: top nav + resizable split with the spec's default ratio; right side hosts the M8 tabs.
- [ ] Top nav shows project switcher, status, phase, active group, run/pause, deploy entry, avatar dropdown with settings; no model-routing setting.
- [ ] Information stream shows all required items, verbose collapsed, with inline gate cards.
- [ ] Swimlane shows agents x P/A/O/R with active/completed/failed states.
- [ ] Switching stream <-> swimlane is lossless and shows the same data.

## Do Not

- Do not give the two renderers separate data stores.
- Do not expose model routing in settings.
- Do not add a third left-panel mode (spec §20 excludes the crowded option).

## Output

- The complete control console: top nav + left renderer (stream/swimlane) + right tabs, all over one event-and-state source.
