import { randomUUID } from "node:crypto";
import { ArchitectOutputSchema, techPlanVersions } from "@oc/shared";
import { DEVELOPMENT_AGENT_IDS } from "@oc/agent-core";
import type { DevelopmentSessionPayload, DevelopmentWorkflowDeps } from "./types.js";
import { saveDevSession } from "./state.js";

export async function runArchitect(
  deps: DevelopmentWorkflowDeps,
  payload: DevelopmentSessionPayload,
  input: { prd: string; acceptance: string },
): Promise<DevelopmentSessionPayload> {
  const result = await deps.runAgent({
    projectId: payload.state.projectId,
    agentIdAtVersion: DEVELOPMENT_AGENT_IDS.architect,
    task: {
      state: payload.state,
      profile: payload.meta.profile,
      prd: input.prd,
      acceptance: input.acceptance,
    },
  });

  if (result.failed || result.output == null) {
    throw new Error("Architect agent failed to produce structured output");
  }

  const parsed = ArchitectOutputSchema.parse(result.output);
  const version = payload.state.techPlanVersion
    ? bumpTechPlanVersion(payload.state.techPlanVersion)
    : "tp-1";
  const now = new Date().toISOString();

  deps.db
    .insert(techPlanVersions)
    .values({
      id: randomUUID(),
      project_id: payload.state.projectId,
      version,
      content: parsed.techPlan,
      created_at: now,
    })
    .run();

  const next: DevelopmentSessionPayload = {
    ...payload,
    state: {
      ...payload.state,
      techPlanVersion: version,
      risks: [...payload.state.risks, ...parsed.risks],
    },
    meta: {
      ...payload.meta,
      phase: "tech_plan",
    },
  };

  saveDevSession(deps.db, payload.state.projectId, next);
  return next;
}

function bumpTechPlanVersion(current: string): string {
  const match = /^tp-(\d+)$/.exec(current);
  if (!match) {
    return `${current}-2`;
  }
  return `tp-${Number(match[1]) + 1}`;
}

export function raiseTechPlanGate(
  deps: DevelopmentWorkflowDeps,
  payload: DevelopmentSessionPayload,
): DevelopmentSessionPayload {
  const gate = deps.createGate(payload.state.projectId, "tech_plan_confirm");
  deps.setStatus(payload.state.projectId, "Tech Plan Review", "development_tech_plan_ready");

  const next = {
    ...payload,
    meta: {
      ...payload.meta,
      phase: "awaiting_gate" as const,
      gateId: gate.id,
      gateType: "tech_plan_confirm" as const,
    },
  };
  saveDevSession(deps.db, payload.state.projectId, next);
  return next;
}
