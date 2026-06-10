import {
  callIntegrationTool,
  getIntegrationGateMode,
  type CallIntegrationToolDeps,
  type CallIntegrationToolInput,
  type CallIntegrationToolResult,
  type IntegrationCaller,
} from "@oc/integrations";
import { isApprovalDecision, type Db, type EventEnvelope } from "@oc/shared";
import type { GateService } from "../gates/service.js";

export type CreateCallIntegrationToolDepsInput = {
  db: Db;
  projectId: string;
  artifactsPath?: string;
  skillPacksRoot?: string;
  onEvent?: (envelope: EventEnvelope) => void;
  gates: GateService;
  caller?: IntegrationCaller;
  gateWaitTimeoutMs?: number;
};

export function createCallIntegrationToolDeps(
  input: CreateCallIntegrationToolDepsInput,
): CallIntegrationToolDeps {
  const gateWaitTimeoutMs =
    input.gateWaitTimeoutMs ??
    (process.env.OC_GATE_WAIT_TIMEOUT_MS !== undefined
      ? Number(process.env.OC_GATE_WAIT_TIMEOUT_MS)
      : 0);

  return {
    db: input.db,
    projectId: input.projectId,
    artifactsPath: input.artifactsPath,
    skillPacksRoot: input.skillPacksRoot,
    caller: input.caller ?? "ui",
    onEvent: input.onEvent,
    authorizeIntegrationWrite: async (authInput) => {
      const gate = input.gates.createGate(input.projectId, "dangerous_operation", {
        riskLevel: "high",
        integrationId: authInput.integrationId,
        toolName: authInput.toolName,
        caller: input.caller ?? "ui",
      });
      const metadata = { riskLevel: "high" as const };

      if (getIntegrationGateMode() === "async") {
        return {
          pending: true,
          gateId: gate.id,
          message: `Gate ${gate.id} created for ${authInput.integrationId}:${authInput.toolName}`,
        };
      }

      const decision = await input.gates.waitForGate(gate.id, { timeoutMs: gateWaitTimeoutMs });
      if (isApprovalDecision("dangerous_operation", metadata, decision)) {
        return { allow: true };
      }
      return {
        allow: false,
        reason: `Integration gate rejected ${authInput.toolName}: ${decision}`,
      };
    },
  };
}

export async function callProjectIntegrationTool(
  input: CreateCallIntegrationToolDepsInput & CallIntegrationToolInput,
): Promise<CallIntegrationToolResult> {
  const { integrationId, toolName, args, ...depsInput } = input;
  const deps = createCallIntegrationToolDeps(depsInput);
  return callIntegrationTool(deps, { integrationId, toolName, args });
}
