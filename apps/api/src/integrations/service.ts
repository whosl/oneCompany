import {
  buildIntegrationStatusForProject,
  callIntegrationTool,
  enableIntegrationForProject,
  listIntegrations,
  listInstalledSkillPacks,
  type CallIntegrationToolResult,
} from "@oc/integrations";
import { isApprovalDecision, type Db, type EventEnvelope, type IntegrationStatusSnapshot } from "@oc/shared";
import type { GateService } from "../gates/service.js";
import type { ProjectService } from "../projects/service.js";
import type { WorkspaceService } from "../workspace/service.js";

export function createIntegrationService(
  db: Db,
  projects: ProjectService,
  gates: GateService,
  workspace: WorkspaceService,
  onEvent: (envelope: EventEnvelope) => void,
) {
  return {
    listDefinitions() {
      return listIntegrations();
    },

    listSkillPacks() {
      return listInstalledSkillPacks();
    },

    listProjectStatus(projectId: string): IntegrationStatusSnapshot[] {
      projects.getProject(projectId);
      return buildIntegrationStatusForProject(db, projectId);
    },

    async enableForProject(
      projectId: string,
      integrationId: string,
      scopes: string[],
    ) {
      projects.getProject(projectId);
      return enableIntegrationForProject(db, { projectId, integrationId, scopes });
    },

    async callTool(
      projectId: string,
      integrationId: string,
      toolName: string,
      args?: unknown,
    ): Promise<CallIntegrationToolResult> {
      const project = projects.getProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }
      const paths = workspace.ensureForProject(project);
      return callIntegrationTool(
        {
          db,
          projectId,
          artifactsPath: paths.artifacts,
          onEvent,
          authorizeIntegrationWrite: async (input) => {
            const gate = gates.createGate(projectId, "dangerous_operation", {
              riskLevel: "high",
            });
            const metadata = { riskLevel: "high" as const };
            const decision = await gates.waitForGate(gate.id, { timeoutMs: 0 });
            if (isApprovalDecision("dangerous_operation", metadata, decision)) {
              return { allow: true };
            }
            return {
              allow: false,
              reason: `Integration gate rejected ${input.toolName}: ${decision}`,
            };
          },
        },
        { integrationId, toolName, args },
      );
    },
  };
}

export type IntegrationService = ReturnType<typeof createIntegrationService>;
