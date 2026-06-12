import { and, eq } from "drizzle-orm";
import { commits, emit, humanGates, type Db, type DevState, type EventEnvelope } from "@oc/shared";
import { markSlicePassed } from "./state.js";
import { SLICE_FAILURE_GATE } from "./types.js";

export function hasOpenHumanGate(db: Db, projectId: string, gateType: string): boolean {
  const row = db
    .select({ id: humanGates.id })
    .from(humanGates)
    .where(
      and(
        eq(humanGates.project_id, projectId),
        eq(humanGates.gate_type, gateType),
        eq(humanGates.status, "open"),
      ),
    )
    .all()[0];
  return Boolean(row);
}

export function hasOpenSliceFailureGate(db: Db, projectId: string): boolean {
  return hasOpenHumanGate(db, projectId, SLICE_FAILURE_GATE);
}

/** Close a stale open slice_failure gate after commits/session prove progress. */
export function resolveStaleSliceFailureGate(
  db: Db,
  projectId: string,
  decision = "auto_reconciled",
  onEvent?: (envelope: EventEnvelope) => void,
): boolean {
  const row = db
    .select()
    .from(humanGates)
    .where(
      and(
        eq(humanGates.project_id, projectId),
        eq(humanGates.gate_type, SLICE_FAILURE_GATE),
        eq(humanGates.status, "open"),
      ),
    )
    .all()[0];
  if (!row) {
    return false;
  }

  const now = new Date().toISOString();
  db.update(humanGates)
    .set({
      status: "resolved",
      decision,
      resolved_at: now,
    })
    .where(eq(humanGates.id, row.id))
    .run();

  onEvent?.(
    emit(db, {
      projectId,
      payload: {
        type: "human_gate.resolved",
        projectId,
        gateId: row.id,
        gateType: SLICE_FAILURE_GATE,
        decision,
      },
    }),
  );
  return true;
}

/** Align taskQueue with commits already recorded (e.g. loop died after commit, before save). */
export function reconcilePassedSlicesFromCommits(
  db: Db,
  state: DevState,
  onEvent?: (envelope: EventEnvelope) => void,
): DevState {
  const rows = db
    .select()
    .from(commits)
    .where(eq(commits.project_id, state.projectId))
    .all();

  let next = state;
  let reconciled = false;
  for (const row of rows) {
    const task = next.taskQueue.find((item) => item.id === row.task_id);
    if (!task || task.status === "passed" || task.status === "skipped") {
      continue;
    }
    reconciled = true;
    next = markSlicePassed(next, row.task_id);
    if (!next.commits.some((commit) => commit.hash === row.hash)) {
      next = {
        ...next,
        commits: [
          ...next.commits,
          { hash: row.hash, taskId: row.task_id, summary: row.summary ?? row.task_id },
        ],
      };
    }
  }

  if (reconciled) {
    resolveStaleSliceFailureGate(db, state.projectId, "auto_reconciled", onEvent);
  }
  return next;
}
