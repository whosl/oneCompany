# Phase M1 — Event Log + SSE + Status Machine + Gate Foundation

## Goal

Build the backbone everything else uses: an append-only event log, a live SSE stream to the browser, a status-machine module that guards all status changes, and a minimal blocking-gate primitive.

## Prerequisites

- M0 done. The DB has the `events`, `projects`, `project_status_history`, and `human_gates` tables. `@oc/shared` exports `EventEnvelope`, `AgentEvent`, `ProjectStatus`, `STATUS_TRANSITIONS`.

## Concepts You Need

- Append-only: you only ever insert events. Never update or delete an event row.
- `seq`: a per-project counter starting at 1, increasing by 1 for each new event. Used to order events and to replay.
- Control source vs audit source (spec §8, R1): durable state decides what happens next; the event log is history + what the UI streams. Status lives in the `projects` table (durable). Events only record that it changed.
- Blocking gate: the workflow calls "create gate" and then waits. A person (or, for now, an API call) resolves it. Only then does the workflow continue.

## Spec References

`spec.md` §8, §8.1, §8.2, §3.1, §6, §10.3.

## Tasks

### Task 1.1 — Event log writer

Create `packages/shared/src/events/log.ts` (or in `apps/api` if simpler) with one function:

```ts
async function emit(input: {
  projectId: string;
  payload: AgentEvent;          // from @oc/shared
  runId?: string;
  agentId?: string;
  correlationId?: string;
}): Promise<EventEnvelope<AgentEvent>>;
```

Rules:
- Compute the next `seq` for the project (max existing seq + 1). Do this inside a transaction so two events never get the same seq.
- Fill `eventId` (uuid), `schemaVersion` (start at `"1"`), `timestamp` (ISO now).
- Insert into the `events` table.
- Return the full envelope.

Verify: write a unit test that emits 3 events for one project and asserts seq is 1, 2, 3.

### Task 1.2 — Project create + status history

In `apps/api`, add:
- `POST /projects` with body `{ name }`. It creates a project with status `Draft Requirement`, emits `project.created`, and returns the project.
- A helper `setStatus(projectId, nextStatus, reason)` that:
  1. Reads current status.
  2. Calls the status-machine check (Task 1.3). If the move is illegal, throw.
  3. Updates `projects.status`.
  4. Inserts a row in `project_status_history`.
  5. Emits `project.status_changed`.

Verify: `POST /projects` returns a project with status `Draft Requirement` and a `project.created` event exists.

### Task 1.3 — Status-machine module

Create `packages/shared/src/status/machine.ts`:

```ts
function canTransition(from: ProjectStatus, to: ProjectStatus): boolean;
function assertTransition(from: ProjectStatus, to: ProjectStatus): void; // throws if illegal
```

- Use `STATUS_TRANSITIONS` from M0.
- Handle the cross-cutting rules from spec §3.1: any active (non-terminal, non-paused) state may go to `Paused`; `Paused` may return to the state it came from; any active state may go to `Failed`.
- `Delivered` and `Failed` are terminal: no transitions out.

Verify: unit tests — `Developing -> Testing` is allowed; `Developing -> Delivered` is rejected; `Delivered -> anything` is rejected; `Developing -> Paused -> Developing` works.

### Task 1.4 — SSE endpoint

In `apps/api`, add `GET /projects/:id/events/stream`:
- It is an SSE response.
- Optional query `?afterSeq=N`: first replay all stored events for the project with `seq > N` (in order), then stream new ones live.
- Each SSE message is one full `EventEnvelope` as JSON.

Verify: open the stream for a project, then emit an event from another request; the client receives it. With `?afterSeq=0`, all past events arrive in seq order.

### Task 1.5 — Gate foundation

Create gate primitives (in `apps/api` plus helpers in `@oc/shared`):
- `createGate(projectId, gateType, options)`: inserts a `human_gates` row with status `open`, emits `human_gate.created`, returns `gateId`.
- `resolveGate(gateId, decision)`: sets the row to `resolved` with the decision, emits `human_gate.resolved`.
- `waitForGate(gateId)`: a way for a workflow to block until the gate is resolved, then return the decision. (For now, polling the DB is acceptable.)
- `POST /gates/:id/resolve` with body `{ decision }` calls `resolveGate`.

Note: the full card UI and per-gate allowed-action rules come in M4. Here you only need create / resolve / wait + the resolve API.

Verify: create a gate, confirm `human_gate.created` is emitted and an `open` row exists; call the resolve API; confirm the row is `resolved` and `human_gate.resolved` is emitted.

### Task 1.6 — Throwaway event viewer

In `apps/web`, add a dev-only page that connects to the SSE stream for a project and prints each event as raw JSON in a list. This is just to see events; it will be replaced in M9.

Verify: creating a project and emitting events shows them appear live on this page.

## Verification

```bash
pnpm -w typecheck && pnpm -w test
# manual: POST /projects, open SSE stream, see project.created
# manual: drive an illegal status change -> rejected with an error
# manual: create + resolve a gate -> two events emitted
```

## Definition of Done

- [ ] `emit()` writes enveloped events with correct per-project `seq`.
- [ ] `POST /projects` creates a project and emits `project.created`.
- [ ] `setStatus` rejects illegal transitions and records history + `project.status_changed`.
- [ ] Status machine passes its unit tests, including `Paused` and `Failed` rules.
- [ ] SSE stream replays from `afterSeq` then streams live events.
- [ ] Gate foundation can create, wait on, and resolve a blocking gate via API, emitting both gate events.
- [ ] The dev event-viewer page shows events live.

## Do Not

- Do not let any code update `projects.status` directly. Always go through `setStatus` + the status machine.
- Do not reuse or skip `seq` numbers.
- Do not build gate UI here. That is M4.

## Output

- `emit()` event log, used by every later phase to record what happens.
- `setStatus` + status machine, the only legal way to change status.
- SSE stream for the UI.
- Gate create/wait/resolve primitive, used by M3 (requirement stuck) and M4 (all gates).
