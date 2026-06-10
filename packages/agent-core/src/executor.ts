import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  agentRuns,
  emit,
  listEvents,
  type Db,
  type EventEnvelope,
} from "@oc/shared";
import type { CallIntegrationToolDeps } from "@oc/integrations";
import type { AuthorizeFn } from "./harness/permission-bridge.js";
import { getAgent } from "./registry.js";
import { pickModel } from "./router.js";

export type AgentRunnerSummaries = {
  plan: string;
  act: string;
  observe: string;
  reflect: string;
};

export type AgentRunnerResult = {
  output: unknown;
  summaries?: Partial<AgentRunnerSummaries>;
};

export type AgentRunContext = {
  projectId: string;
  db: Db;
  onEvent?: (envelope: EventEnvelope) => void;
  authorize?: AuthorizeFn;
  repoPath?: string;
  callIntegration?: CallIntegrationToolDeps;
  enabledIntegrationIds?: string[];
};

export type AgentRunner = (
  runCtx: AgentRunContext,
  agentIdAtVersion: string,
  task: unknown,
) => Promise<AgentRunnerResult> | AgentRunnerResult;

export type ExecutorContext = {
  db: Db;
  onEvent?: (envelope: EventEnvelope) => void;
  runner?: AgentRunner;
  authorize?: AuthorizeFn;
  repoPath?: string;
  callIntegration?: CallIntegrationToolDeps;
  enabledIntegrationIds?: string[];
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

  let output: unknown = { summary: "stub", modelId };

  let runnerSummaries: AgentRunnerSummaries | undefined;

  if (ctx.runner) {
    try {
      const runnerResult = await ctx.runner(
        {
          projectId: input.projectId,
          db: ctx.db,
          onEvent: ctx.onEvent,
          authorize: ctx.authorize,
          repoPath: ctx.repoPath,
          callIntegration: ctx.callIntegration,
          enabledIntegrationIds: ctx.enabledIntegrationIds,
        },
        input.agentIdAtVersion,
        input.task,
      );
      output = runnerResult.output;
      if (runnerResult.summaries) {
        runnerSummaries = {
          plan: runnerResult.summaries.plan ?? `Plan for ${agent.role}`,
          act: runnerResult.summaries.act ?? `Acting with ${modelId}`,
          observe: runnerResult.summaries.observe ?? "Observed structured output",
          reflect: runnerResult.summaries.reflect ?? "Reflected on run",
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return failRun(ctx, {
        projectId: input.projectId,
        agentId: agent.id,
        runId,
        rowId,
        modelId,
        message,
      });
    }
  } else if (input.forceFail) {
    return failRun(ctx, {
      projectId: input.projectId,
      agentId: agent.id,
      runId,
      rowId,
      modelId,
      message: "Forced failure (stub)",
    });
  }

  if (!ctx.runner) {
    output = { summary: "stub", modelId };
  }

  const summaries: AgentRunnerSummaries = runnerSummaries ?? {
    plan: `Plan for ${agent.role}`,
    act: `Acting with ${modelId}`,
    observe: ctx.runner ? "Observed structured output" : "Observed stub outcome",
    reflect: "Reflected on run",
  };

  for (const [phase, summary] of Object.entries(summaries)) {
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
    output,
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
