import {
  buildIntegrationStatusForProject,
  enableIntegrationForProject,
  getIntegrationGatewayMeta,
  listIntegrations,
  listInstalledSkillPacks,
  parseGatewayToolName,
  type CallIntegrationToolResult,
} from "@oc/integrations";
import type { Db, EventEnvelope, IntegrationStatusSnapshot } from "@oc/shared";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { GateService } from "../gates/service.js";
import type { ProjectService } from "../projects/service.js";
import type { WorkspaceService } from "../workspace/service.js";
import { callProjectIntegrationTool, createCallIntegrationToolDeps } from "./deps-factory.js";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const DEFAULT_SKILL_PACKS_ROOT = path.join(REPO_ROOT, "skill-packs");

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

    getGatewayMeta() {
      return getIntegrationGatewayMeta(DEFAULT_SKILL_PACKS_ROOT);
    },

    listSkillPacks() {
      return listInstalledSkillPacks(DEFAULT_SKILL_PACKS_ROOT);
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

    async callOpencodeTool(
      projectId: string,
      prefixedToolName: string,
      args?: unknown,
    ): Promise<CallIntegrationToolResult> {
      const { integrationId, toolName } = parseGatewayToolName(prefixedToolName);
      return this.callTool(projectId, integrationId, toolName, args, "opencode");
    },

    async callTool(
      projectId: string,
      integrationId: string,
      toolName: string,
      args?: unknown,
      caller: "ui" | "workflow" | "agent" | "opencode" = "ui",
    ): Promise<CallIntegrationToolResult> {
      const project = projects.getProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }
      const paths = workspace.ensureForProject(project);
      return callProjectIntegrationTool({
        db,
        projectId,
        artifactsPath: paths.artifacts,
        skillPacksRoot: DEFAULT_SKILL_PACKS_ROOT,
        onEvent,
        gates,
        caller,
        integrationId,
        toolName,
        args,
      });
    },

    createToolDeps(
      projectId: string,
      options: {
        artifactsPath?: string;
        caller?: "ui" | "workflow" | "agent" | "opencode";
      } = {},
    ) {
      return createCallIntegrationToolDeps({
        db,
        projectId,
        artifactsPath: options.artifactsPath,
        skillPacksRoot: DEFAULT_SKILL_PACKS_ROOT,
        onEvent,
        gates,
        caller: options.caller,
      });
    },
  };
}

export type IntegrationService = ReturnType<typeof createIntegrationService>;
