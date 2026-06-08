import path from "node:path";
import {
  ensureWorkspace,
  isDockerAvailable,
  listFiles,
  readFile,
  runCommand,
  runInSandbox,
  runLocalCommand,
  type RunCommandResult,
  type ShellDeps,
  type WorkspacePaths,
} from "@oc/workspace";
import type { Db, EventEnvelope } from "@oc/shared";
import type { GateService } from "../gates/service.js";
import type { ProjectRecord, ProjectService } from "../projects/service.js";

export type WorkspaceServiceOptions = {
  generatedProjectsRoot?: string;
  onEvent?: (envelope: EventEnvelope) => void;
};

export function createWorkspaceService(
  db: Db,
  projects: ProjectService,
  gates: GateService,
  options: WorkspaceServiceOptions = {},
) {
  const resolvePaths = (project: ProjectRecord): WorkspacePaths =>
    ensureWorkspace({
      projectId: project.id,
      slug: project.slug,
      rootDir: options.generatedProjectsRoot
        ? path.join(options.generatedProjectsRoot, project.slug)
        : undefined,
    });

  const buildShellDeps = (project: ProjectRecord): ShellDeps => {
    const workspacePaths = resolvePaths(project);
    return {
      db,
      projectId: project.id,
      repoPath: workspacePaths.repo,
      logsPath: workspacePaths.logs,
      onEvent: options.onEvent,
      createGate: (projectId, gateType, metadata) => {
        const gate = gates.createGate(projectId, gateType, metadata);
        return { id: gate.id, projectId: gate.projectId, gateType: gate.gateType };
      },
      waitForGate: (gateId) => gates.waitForGate(gateId),
      runLocal: runLocalCommand,
      runSandbox: (cmd, projectPath) => runInSandbox(projectPath, cmd),
      isDockerAvailable,
    };
  };

  return {
    ensureForProject(project: ProjectRecord): WorkspacePaths {
      return resolvePaths(project);
    },

    listProjectFiles(projectId: string): { files: string[] } {
      const project = projects.getProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }
      const workspace = resolvePaths(project);
      return { files: listFiles(workspace.repo) };
    },

    readProjectFile(projectId: string, relativePath: string): { path: string; content: string } {
      const project = projects.getProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }
      const workspace = resolvePaths(project);
      return {
        path: relativePath,
        content: readFile(workspace.repo, relativePath),
      };
    },

    createShellDeps(project: ProjectRecord): ShellDeps {
      return buildShellDeps(project);
    },

    async runProjectCommand(projectId: string, cmd: string): Promise<RunCommandResult> {
      const project = projects.getProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }
      return runCommand(buildShellDeps(project), {
        projectId,
        cmd,
      });
    },
  };
}

export type WorkspaceService = ReturnType<typeof createWorkspaceService>;

export function devCommandsEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}
