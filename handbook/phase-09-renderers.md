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
- The Figma UI baseline is `OneCompany Console - Claude Style Draft`: https://www.figma.com/design/r1RF1q4KzBEQHLBWVhGD0X. Use the frames `Stream Mode`, `Swimlane Mode`, `Settings Modal`, `Project Hub Modal`, and `Claude-inspired Style Tokens` as the visual baseline.
- Settings is global environment/secrets/readiness only. Project Hub is project management. Do not merge these surfaces.
- TDD focus: write projection tests first, then UI contract tests for top nav, Settings, Project Hub, stream rendering, swimlane rendering, and lossless mode switching.

## Spec References

`spec.md` §14.1-§14.8, §8, §20.

## Tasks

### Task 9.1 — Event projection (shared)

Start red: write projection tests from fixed event fixtures before building the store. Include user messages, gates, tool calls, diffs, and test results.

Create one client-side store that subscribes to the SSE stream and builds a projection: the ordered event list plus a derived "current snapshot" (status, phase, active agents, latest P/A/O/R per agent, user messages/answers, open gates, latest tool/test/diff summaries). Both renderers read from THIS store only.

Verify: a unit/integration test feeds a known event sequence and asserts the projection (e.g., latest plan summary for an agent).

### Task 9.2 — Visual tokens

Implement the Claude-inspired token set from spec §14.8:
- warm page and panel surfaces
- dark ink text
- copper/orange primary accent
- muted warm borders
- green success, amber warning, red danger states

Keep the style compact and operational. Do not create a marketing layout, decorative gradient background, or crowded third-panel design.

Verify: the token names are available to the app shell and shared components; no component hardcodes a conflicting one-off palette.

### Task 9.3 — Layout shell

Build the main layout: top nav across the top; below it a resizable left/right split (default left ~44%, right ~56%). The right side hosts the M8 tabs; the left side hosts the renderer (Task 9.4/9.5).

Verify: the layout renders, the split is draggable, defaults match spec.

### Task 9.4 — Top nav

Start red: write UI tests for coherent status/phase/group pills and the Settings/Project Hub entry points.

Build the top nav with: project switcher, current status, current phase, active agent group indicator, run/pause control, deployment entry, and an avatar dropdown.

Keep the state pills coherent with the lifecycle phase. For example, `Developing` pairs with `Development Group` and slice progress like `Slice 2 / 3`; do not show `Requirement Group` or an active completeness score as the phase indicator once development has started.

Verify: the nav shows live status/phase from the projection; switching projects works; Settings opens from the avatar; Project Hub opens from the project switcher.

### Task 9.5 — Settings modal

Build the Settings modal opened from the avatar dropdown. It includes:
- local workspace paths and generated-project root
- API key and secret readiness status, without revealing values
- Cloudflare Tunnel readiness/configuration status
- environment checks for Node, pnpm, Git, Docker, SQLite/database path, and Playwright/browser availability
- read-only policy chips for automatic model routing, fixed sandbox policy, governed shell risk grading, and secret redaction

Do not include project management, model routing settings, sandbox policy controls, shell-risk controls, or raw secret values.

Verify: Settings opens from avatar; all checks render from live/readable config state or a clear "not configured" state; excluded controls are absent.

### Task 9.6 — Project Hub modal

Build the Project Hub modal opened from the project switcher. It includes:
- search and filters
- project list with name, path, status, completeness, open gates, risk count, and update time
- selected project metrics: status, active group, completeness, open gates, risk items, commits, created time
- status flow timeline
- open human gate summary with Resolve Gate / View Log actions
- preview/deployment summary with Open Preview / Deploy actions
- artifact cards for PRD, acceptance cases, delivery report, project folder, logs, screenshots/traces, and generated source
- project actions: Open, Pause/Resume, Archive, New Project

The compact project-switcher dropdown and full Project Hub modal are mutually exclusive. Opening the Hub closes/hides the compact dropdown.

Verify: Project Hub shows multiple projects from real project data; selecting a project updates the detail pane; Settings does not manage projects; the compact dropdown does not overlap the Hub.

### Task 9.7 — Information stream renderer

Start red: write renderer tests for ordered events, collapsed verbose details, user-vs-agent styling, inline gates, and composer submission through the correct API.

Render the projection as a chronological feed: user requirement + answers, user custom instructions, completeness score, agent events in order, P/A/O/R summaries, tool calls, command output, diffs, test results, human gate cards (reuse M4 `GateCard`), and risk warnings. Collapse verbose details by default (spec §14.3).

Add the sticky user composer at the bottom of Stream Mode. It supports answering gap questions, adding supplementary requirements, providing custom gate text, and choosing gate options. It must submit through the current workflow/gate API and must not imply approval unless the selected gate option allows it.

Verify: events appear in order; verbose blocks are collapsed but expandable; a raised gate shows its card inline; a user message card is visibly distinct from agent cards; the composer can send an answer/custom gate note through the correct API.

### Task 9.8 — Swimlane renderer

Start red: write a lossless-switching test that feeds one projection and asserts stream and swimlane expose the same user/gate/agent data.

Add a button to switch the left panel to swimlane mode. Render the SAME projection as a grid: rows = agents, columns = Plan/Act/Observe/Reflect. Active cells emphasized, completed cells compact, failed cells show risk/retry (from failure events). Switching back and forth must not lose or change data (spec §14.4).

Represent user messages and gates as compact markers/cells derived from the same projection.

Verify: switching to swimlane shows the same underlying events arranged by agent x phase; failed cells appear when failure events exist; user/gate markers remain discoverable; switching back is lossless.

## Verification

```bash
pnpm -w typecheck && pnpm -w test
# manual: run a workflow; watch the info stream update live; switch to swimlane -> same data, different layout
# manual: top nav status/phase update; run/pause control reflects status
# manual: avatar opens Settings; project switcher opens Project Hub; Stream composer sends a user answer/custom gate note
```

## Definition of Done

- [x] A single projection store feeds both renderers (no per-view state store).
- [x] Claude-inspired visual tokens are implemented and used by the console shell.
- [x] Layout: top nav + resizable split with the spec's default ratio; right side hosts the M8 tabs.
- [x] Top nav shows project switcher, status, phase, active group, run/pause, deploy entry, avatar dropdown.
- [x] Settings opens from avatar and includes only global environment/secrets/readiness; no model-routing, sandbox, shell-risk, or project-management controls.
- [x] Project Hub opens from project switcher and handles multi-project management.
- [x] Top-nav phase/status/group/progress pills are coherent with the active lifecycle state.
- [x] Compact project dropdown and Project Hub modal are mutually exclusive.
- [x] Information stream shows all required items, verbose collapsed, with user cards, inline gate cards, and sticky user composer.
- [x] Swimlane shows agents x P/A/O/R with active/completed/failed states plus user/gate markers from the same projection.
- [x] Switching stream <-> swimlane is lossless and shows the same data.
- [x] Projection, top nav, Settings, Project Hub, information stream, swimlane, and mode-switch behaviors are covered by tests that failed before implementation.

## Deferred to M11 (not blockers for the M9 demo)

The core spine above is required for M9. These §14.3.1 stream refinements are explicitly deferred to phase M11 (`phase-11-hardening-acceptance.md`, Task 11.7) — implement them there, or descope with a note:

- [ ] Run grouping in the stream by `runId` / `agentId` / `correlationId`.
- [ ] Plan/Act/Observe/Reflect collapsible segments inside the stream (active expanded, completed collapsed). Today only the swimlane shows P/A/O/R.
- [ ] Newest-at-bottom feed with pin-to-bottom auto-scroll.
- [ ] Large tool output folded to artifact links (today only "open in Terminal").
- [ ] Tool-call rows expandable to args/result.

Note: the inline `GateCard` (stream) and the gate buttons in the sticky composer are both intentional surfaces from the §14.3.1 contract and are covered by tests; keep both.

## Do Not

- Do not give the two renderers separate data stores.
- Do not expose model routing in settings.
- Do not put project management in settings; use Project Hub.
- Do not let the Stream composer bypass gate policies.
- Do not add a third left-panel mode (spec §20 excludes the crowded option).
- Do not test stream and swimlane as separate data systems; both must be verified from the same projection fixture.

## Output

- The complete control console: top nav + Settings + Project Hub + left renderer (stream/swimlane) + right tabs, all over one event-and-state source.
