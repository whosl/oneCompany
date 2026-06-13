import { desc, eq } from "drizzle-orm";
import {
  devSessions,
  humanGates,
  listEvents,
  projects,
  requirementSessions,
  techPlanVersions,
} from "@oc/shared";
import { z } from "zod";
import { LOCAL_TOOL_IDS } from "../../tools/local-tools.js";
import { registerTool } from "../../tools/registry.js";

const TOOL_VERSION = "1.0.0";

export const TAIZI_TOOL_IDS = {
  projectOverview: `project-overview@${TOOL_VERSION}`,
  listRecentEvents: `list-recent-events@${TOOL_VERSION}`,
  readDevSession: `read-dev-session@${TOOL_VERSION}`,
  readRequirementSession: `read-requirement-session@${TOOL_VERSION}`,
  listProjectGates: `list-project-gates@${TOOL_VERSION}`,
  readTechPlan: `read-tech-plan@${TOOL_VERSION}`,
} as const;

/** Read-only tools Taizi may call when answering informational questions. */
export const TAIZI_READ_TOOL_IDS = [
  LOCAL_TOOL_IDS.readArtifact,
  LOCAL_TOOL_IDS.workspaceRead,
  TAIZI_TOOL_IDS.projectOverview,
  TAIZI_TOOL_IDS.listRecentEvents,
  TAIZI_TOOL_IDS.readDevSession,
  TAIZI_TOOL_IDS.readRequirementSession,
  TAIZI_TOOL_IDS.listProjectGates,
  TAIZI_TOOL_IDS.readTechPlan,
] as const;

let taiziToolsRegistered = false;

function condenseEventPayload(type: string, payload: Record<string, unknown>): Record<string, unknown> {
  const pick = (keys: string[]) =>
    Object.fromEntries(keys.filter((k) => payload[k] !== undefined).map((k) => [k, payload[k]]));
  switch (type) {
    case "test.result":
      return pick(["suite", "status", "details"]);
    case "human_gate.created":
    case "human_gate.resolved":
      return pick(["gateType", "gateId", "decision"]);
    case "taizi.routed":
      return pick(["intent", "action", "reply", "stateChanged"]);
    case "tool_call.started":
      return pick(["toolName", "summary"]);
    case "tool_call.failed":
      return pick(["toolName", "error"]);
    case "agent.observe":
    case "agent.act":
    case "agent.plan":
      return pick(["agentId", "summary"]);
    default:
      return pick(["type", "summary", "status", "error", "reply"]);
  }
}

export function registerTaiziTools(): void {
  if (taiziToolsRegistered) {
    return;
  }

  registerTool({
    id: "project-overview",
    version: TOOL_VERSION,
    description:
      "Read project metadata: name, status, slug, timestamps. Use first to orient on the current project.",
    protocol: "local",
    riskLevel: "low",
    permissions: ["read"],
    argsSchema: z.object({}),
    impl: async (_args, ctx) => {
      const row = ctx.db
        .select()
        .from(projects)
        .where(eq(projects.id, ctx.projectId))
        .all()[0];
      if (!row) {
        return { error: `Project not found: ${ctx.projectId}` };
      }
      const events = listEvents(ctx.db, ctx.projectId);
      const lastSeq = events.at(-1)?.seq ?? 0;
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        eventCount: events.length,
        lastEventSeq: lastSeq,
        repoConfigured: Boolean(ctx.repoPath),
      };
    },
  });

  registerTool({
    id: "list-recent-events",
    version: TOOL_VERSION,
    description:
      "List recent project event log entries (newest last). Optional type filter, e.g. test.result or human_gate.resolved.",
    protocol: "local",
    riskLevel: "low",
    permissions: ["read"],
    argsSchema: z.object({
      limit: z.number().int().min(1).max(50).optional(),
      type: z.string().optional(),
      afterSeq: z.number().int().min(0).optional(),
    }),
    impl: async (args, ctx) => {
      const parsed = z
        .object({
          limit: z.number().int().min(1).max(50).optional(),
          type: z.string().optional(),
          afterSeq: z.number().int().min(0).optional(),
        })
        .parse(args);
      const limit = parsed.limit ?? 20;
      let envelopes = listEvents(ctx.db, ctx.projectId, { afterSeq: parsed.afterSeq ?? 0 });
      if (parsed.type) {
        envelopes = envelopes.filter((e) => e.payload.type === parsed.type);
      }
      const slice = envelopes.slice(-limit);
      return {
        count: slice.length,
        events: slice.map((e) => ({
          seq: e.seq,
          timestamp: e.timestamp,
          type: e.payload.type,
          agentId: e.agentId,
          payload: condenseEventPayload(e.payload.type, e.payload as Record<string, unknown>),
        })),
      };
    },
  });

  registerTool({
    id: "read-dev-session",
    version: TOOL_VERSION,
    description:
      "Read development session: slice queue, current slice, retry attempts, test results, risks, repo path.",
    protocol: "local",
    riskLevel: "low",
    permissions: ["read"],
    argsSchema: z.object({}),
    impl: async (_args, ctx) => {
      const row = ctx.db
        .select()
        .from(devSessions)
        .where(eq(devSessions.project_id, ctx.projectId))
        .all()[0];
      if (!row) {
        return { error: "No development session for this project" };
      }
      const payload = JSON.parse(row.state) as {
        state?: Record<string, unknown>;
        meta?: Record<string, unknown>;
        testing?: Record<string, unknown>;
      };
      const state = (payload.state ?? payload) as Record<string, unknown>;
      const taskQueue = (state.taskQueue as Array<Record<string, unknown>> | undefined) ?? [];
      return {
        phase: payload.meta?.phase,
        repoPath: state.repoPath,
        currentSliceAttempts: state.currentSliceAttempts,
        maxSliceAttempts: state.maxSliceAttempts,
        currentTask: state.currentTask,
        taskQueue: taskQueue.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          testCommand: t.testCommand,
        })),
        testResults: (state.testResults as unknown[] | undefined)?.slice(-8),
        risks: state.risks,
        commits: (state.commits as unknown[] | undefined)?.slice(-5),
        testing: payload.testing,
      };
    },
  });

  registerTool({
    id: "read-requirement-session",
    version: TOOL_VERSION,
    description:
      "Read requirement phase state: summary, completeness, gaps, question rounds, pending clarifications.",
    protocol: "local",
    riskLevel: "low",
    permissions: ["read"],
    argsSchema: z.object({}),
    impl: async (_args, ctx) => {
      const row = ctx.db
        .select()
        .from(requirementSessions)
        .where(eq(requirementSessions.project_id, ctx.projectId))
        .all()[0];
      if (!row) {
        return { error: "No requirement session for this project" };
      }
      const payload = JSON.parse(row.state) as {
        state?: Record<string, unknown>;
        meta?: Record<string, unknown>;
      };
      const state = (payload.state ?? payload) as Record<string, unknown>;
      const rounds =
        (state.questionRounds as Array<{ questions: unknown[]; answers: unknown[] }> | undefined) ??
        [];
      const lastRound = rounds.at(-1);
      return {
        phase: payload.meta?.phase,
        rawRequirement: state.rawRequirement,
        normalizedSummary: state.normalizedSummary,
        completenessScore: state.completenessScore,
        gaps: state.gaps,
        coreFeatures: state.coreFeatures,
        risks: state.risks,
        questionRoundCount: rounds.length,
        pendingQuestionCount:
          lastRound && lastRound.questions.length > 0 && lastRound.answers.length === 0
            ? lastRound.questions.length
            : 0,
        lastQuestions: lastRound?.questions,
      };
    },
  });

  registerTool({
    id: "list-project-gates",
    version: TOOL_VERSION,
    description: "List human gates for the project (open and recently resolved).",
    protocol: "local",
    riskLevel: "low",
    permissions: ["read"],
    argsSchema: z.object({
      status: z.enum(["open", "resolved", "all"]).optional(),
      limit: z.number().int().min(1).max(30).optional(),
    }),
    impl: async (args, ctx) => {
      const parsed = z
        .object({
          status: z.enum(["open", "resolved", "all"]).optional(),
          limit: z.number().int().min(1).max(30).optional(),
        })
        .parse(args);
      const limit = parsed.limit ?? 10;
      let rows = ctx.db
        .select()
        .from(humanGates)
        .where(eq(humanGates.project_id, ctx.projectId))
        .orderBy(desc(humanGates.created_at))
        .all();
      if (parsed.status && parsed.status !== "all") {
        rows = rows.filter((g) => g.status === parsed.status);
      }
      return {
        gates: rows.slice(0, limit).map((g) => ({
          id: g.id,
          gateType: g.gate_type,
          status: g.status,
          decision: g.decision,
          options: JSON.parse(g.options),
          createdAt: g.created_at,
          resolvedAt: g.resolved_at,
        })),
      };
    },
  });

  registerTool({
    id: "read-tech-plan",
    version: TOOL_VERSION,
    description: "Read the latest technical plan artifact for the project.",
    protocol: "local",
    riskLevel: "low",
    permissions: ["read"],
    argsSchema: z.object({}),
    impl: async (_args, ctx) => {
      const row = ctx.db
        .select()
        .from(techPlanVersions)
        .where(eq(techPlanVersions.project_id, ctx.projectId))
        .orderBy(desc(techPlanVersions.created_at))
        .all()[0];
      if (!row) {
        return { error: "No tech plan for this project" };
      }
      return {
        version: row.version,
        content: row.content.slice(0, 12_000),
        truncated: row.content.length > 12_000,
      };
    },
  });

  taiziToolsRegistered = true;
}

export function ensureTaiziToolsRegistered(): void {
  registerTaiziTools();
}

export function resetTaiziToolsRegistrationForTests(): void {
  taiziToolsRegistered = false;
}
