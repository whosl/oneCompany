import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  DEFAULT_MAX_SLICE_ATTEMPTS,
  DevStateSchema,
  devSessions,
  type Db,
  type DevState,
  type FunctionSliceTask,
} from "@oc/shared";
import type { DevFixtureProfile } from "@oc/agent-core";
import type { DevelopmentSessionMeta, DevelopmentSessionPayload } from "./types.js";

export function createInitialDevState(
  projectId: string,
  repoPath: string,
  worktreePath = repoPath,
): DevState {
  return DevStateSchema.parse({
    projectId,
    repoPath,
    worktreePath,
    sandboxMode: "local",
    techPlanVersion: "",
    taskQueue: [],
    maxSliceAttempts: DEFAULT_MAX_SLICE_ATTEMPTS,
    currentSliceAttempts: 0,
    testResults: [],
    diffs: [],
    commits: [],
    deliveryArtifacts: [],
    risks: [],
  });
}

export function createDevSession(
  db: Db,
  projectId: string,
  repoPath: string,
  profile: DevFixtureProfile,
  worktreePath?: string,
): DevelopmentSessionPayload {
  const now = new Date().toISOString();
  const payload: DevelopmentSessionPayload = {
    state: createInitialDevState(projectId, repoPath, worktreePath ?? repoPath),
    meta: {
      phase: "idle",
      profile,
    },
  };

  db.insert(devSessions)
    .values({
      id: randomUUID(),
      project_id: projectId,
      state: JSON.stringify(payload),
      created_at: now,
      updated_at: now,
    })
    .run();

  return payload;
}

export function loadDevSession(db: Db, projectId: string): DevelopmentSessionPayload {
  const row = db
    .select()
    .from(devSessions)
    .where(eq(devSessions.project_id, projectId))
    .all()[0];

  if (!row) {
    throw new Error(`Development session not found: ${projectId}`);
  }

  return parseSessionPayload(row.state);
}

export function saveDevSession(
  db: Db,
  projectId: string,
  payload: DevelopmentSessionPayload,
): void {
  DevStateSchema.parse(payload.state);
  const now = new Date().toISOString();
  db.update(devSessions)
    .set({
      state: JSON.stringify(payload),
      updated_at: now,
    })
    .where(eq(devSessions.project_id, projectId))
    .run();
}

export function updateDevSessionMeta(
  payload: DevelopmentSessionPayload,
  meta: Partial<DevelopmentSessionMeta>,
): DevelopmentSessionPayload {
  return {
    ...payload,
    meta: {
      ...payload.meta,
      ...meta,
    },
  };
}

export function incrementSliceAttempts(state: DevState): DevState {
  return {
    ...state,
    currentSliceAttempts: state.currentSliceAttempts + 1,
  };
}

export function resetSliceAttemptsForNewSlice(state: DevState): DevState {
  return {
    ...state,
    currentSliceAttempts: 0,
  };
}

export function markSlicePassed(state: DevState, sliceId: string): DevState {
  const taskQueue = state.taskQueue.map((task) =>
    task.id === sliceId ? { ...task, status: "passed" as const } : task,
  );
  return {
    ...state,
    taskQueue,
    currentTask: undefined,
    currentSliceAttempts: 0,
  };
}

export function markSliceFailed(state: DevState, sliceId: string): DevState {
  const taskQueue = state.taskQueue.map((task) =>
    task.id === sliceId ? { ...task, status: "failed" as const } : task,
  );
  return {
    ...state,
    taskQueue,
    currentTask: undefined,
  };
}

export function resetSliceForRetry(state: DevState, sliceId: string): DevState {
  const taskQueue = state.taskQueue.map((task) =>
    task.id === sliceId ? { ...task, status: "pending" as const } : task,
  );
  return {
    ...state,
    taskQueue,
    currentTask: undefined,
    currentSliceAttempts: 0,
  };
}

export function markSliceInProgress(state: DevState, slice: FunctionSliceTask): DevState {
  const taskQueue = state.taskQueue.map((task) =>
    task.id === slice.id ? { ...task, status: "in_progress" as const } : task,
  );
  return {
    ...state,
    taskQueue,
    currentTask: { ...slice, status: "in_progress" },
  };
}

export function skipSlice(state: DevState, sliceId: string): DevState {
  const taskQueue = state.taskQueue.map((task) =>
    task.id === sliceId ? { ...task, status: "skipped" as const } : task,
  );
  return {
    ...state,
    taskQueue,
    currentTask: undefined,
    currentSliceAttempts: 0,
    risks: [...state.risks, `Slice ${sliceId} skipped via change review`],
  };
}

function parseSessionPayload(raw: string): DevelopmentSessionPayload {
  const parsed = JSON.parse(raw) as DevelopmentSessionPayload;
  DevStateSchema.parse(parsed.state);
  if (parsed.testing) {
    parsed.testing = {
      ...parsed.testing,
      phase: parsed.testing.phase ?? "idle",
      suiteResults: parsed.testing.suiteResults ?? [],
    };
  }
  return parsed;
}
