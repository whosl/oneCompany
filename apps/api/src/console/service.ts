import { buildConsoleSnapshot } from "@oc/workflow";
import type { Db } from "@oc/shared";
import type { GateService } from "../gates/service.js";
import type { ProjectService } from "../projects/service.js";

export function createConsoleService(
  db: Db,
  projects: ProjectService,
  gates: GateService,
) {
  return {
    getSnapshot(projectId: string) {
      const project = projects.getProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }
      const openGates = gates.listOpenGates(projectId);
      return buildConsoleSnapshot(db, projectId, openGates);
    },
  };
}

export type ConsoleService = ReturnType<typeof createConsoleService>;
