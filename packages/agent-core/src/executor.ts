import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  agentRuns,
  emit,
  listEvents,
  type Db,
  type EventEnvelope,
} from "@oc/shared";
import { getAgent } from "./registry.js";
import { pickModel } from "./router.js";

export type ExecutorContext = {
  db: Db;
  onEvent?: (envelope: EventEnvelope) => void;
};

export type RunAgentInput = {
  projectId: string;
  agentIdAtVersion: string;
  task: unknown;
  forceFail?: boolean;
};

export type RunAgentResult = {
  runId: string;
  output: unknown;
  failed: boolean;
  modelId: string;
};

function notify(ctx: ExecutorContext, envelope: EventEnvelope): void {
  ctx.onEvent?.(envelope);
}

export async function runAgent(
  ctx: ExecutorContext,
  input: RunAgentInput,
): Promise<RunAgentResult> {
  const agent = getAgent(ctx.db, input.agentIdAtVersion);
  const modelId = pickModel(agent.modelPolicy.tier);
  const runId = randomUUID();
  const rowId = randomUUID();
  const now = new Date().toISOString();

  ctx.db.insert(agentRuns)
    .values({
      id: rowId,
      project_id: input.projectId,
      agent_id: input.agentIdAtVersion,
      run_id: runId,
      status: "running",
      started_at: now,
      ended_at: null,
    })
    .run();

  const started = emit(ctx.db, {
    projectId: input.projectId,
    runId,
    agentId: agent.id,
    payload: {
      type: "agent.started",
      projectId: input.projectId,
      agentId: agent.id,
      runId,
    },
  });
  notify(ctx, started);

  if (input.forceFail) {
    return failRun(ctx, {
      projectId: input.projectId,
      agentId: agent.id,
      runId,
      rowId,
      modelId,
      message: "Forced failure (stub)",
    });
  }

  const summaries = {
    plan: `Plan for ${String(input.task ?? "task")}`,
    act: `Acting with ${modelId}`,
    observe: "Observed stub outcome",
    reflect: "Reflected on stub run",
  };

  for (const [phase, summary] of Object.entries({
    plan: summaries.plan,
    act: summaries.act,
    observe: summaries.observe,
    reflect: summaries.reflect,
  })) {
    const envelope = emit(ctx.db, {
      projectId: input.projectId,
      runId,
      agentId: agent.id,
      payload: {
        type: `agent.${phase}` as
          | "agent.plan"
          | "agent.act"
          | "agent.observe"
          | "agent.reflect",
        projectId: input.projectId,
        agentId: agent.id,
        summary,
      },
    });
    notify(ctx, envelope);
  }

  const endedAt = new Date().toISOString();
  ctx.db
    .update(agentRuns)
    .set({ status: "completed", ended_at: endedAt })
    .where(eq(agentRuns.id, rowId))
    .run();

  return {
    runId,
    output: { summary: "stub", modelId },
    failed: false,
    modelId,
  };
}

function failRun(
  ctx: ExecutorContext,
  input: {
    projectId: string;
    agentId: string;
    runId: string;
    rowId: string;
    modelId: string;
    message: string;
  },
): RunAgentResult {
  const errorEnvelope = emit(ctx.db, {
    projectId: input.projectId,
    runId: input.runId,
    agentId: input.agentId,
    payload: {
      type: "agent.error",
      projectId: input.projectId,
      agentId: input.agentId,
      runId: input.runId,
      message: input.message,
    },
  });
  notify(ctx, errorEnvelope);

  const failedEnvelope = emit(ctx.db, {
    projectId: input.projectId,
    runId: input.runId,
    agentId: input.agentId,
    payload: {
      type: "run.failed",
      projectId: input.projectId,
      agentId: input.agentId,
      runId: input.runId,
      reason: input.message,
    },
  });
  notify(ctx, failedEnvelope);

  const endedAt = new Date().toISOString();
  ctx.db
    .update(agentRuns)
    .set({ status: "failed", ended_at: endedAt })
    .where(eq(agentRuns.id, input.rowId))
    .run();

  return {
    runId: input.runId,
    output: null,
    failed: true,
    modelId: input.modelId,
  };
}

export function listAgentRunEvents(ctx: ExecutorContext, projectId: string) {
  return listEvents(ctx.db, projectId);
}
