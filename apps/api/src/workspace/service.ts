import path from "node:path";
import { desc, eq } from "drizzle-orm";
import {
  diffs,
  type FileScope,
} from "@oc/shared";
import {
  ensureWorkspace,
  getGitPatch,
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

    listProjectFiles(
      projectId: string,
      scope: FileScope = "repo",
    ): { scope: FileScope; files: string[] } {
      const project = projects.getProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }
      const workspace = resolvePaths(project);

      if (scope === "repo") {
        return { scope, files: listFiles(workspace.repo) };
      }
      if (scope === "artifacts") {
        return {
          scope,
          files: listFiles(workspace.artifacts).map((file) => `artifacts/${file}`),
        };
      }

      const repoFiles = listFiles(workspace.repo);
      const artifactFiles = listFiles(workspace.artifacts).map((file) => `artifacts/${file}`);
      return { scope, files: [...repoFiles, ...artifactFiles].sort() };
    },

    readProjectFile(
      projectId: string,
      relativePath: string,
      scope: "repo" | "artifacts" = "repo",
    ): { path: string; scope: "repo" | "artifacts"; content: string } {
      const project = projects.getProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }
      const workspace = resolvePaths(project);

      if (scope === "artifacts" || relativePath.startsWith("artifacts/")) {
        const artifactPath = relativePath.replace(/^artifacts\//, "");
        return {
          path: relativePath,
          scope: "artifacts",
          content: readFile(workspace.artifacts, artifactPath),
        };
      }

      return {
        path: relativePath,
        scope: "repo",
        content: readFile(workspace.repo, relativePath),
      };
    },

    listProjectDiffs(projectId: string): Array<{ diffId: string; summary: string; createdAt: string }> {
      const project = projects.getProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }

      return db
        .select()
        .from(diffs)
        .where(eq(diffs.project_id, projectId))
        .orderBy(desc(diffs.created_at))
        .all()
        .map((row) => ({
          diffId: row.diff_id,
          summary: row.summary,
          createdAt: row.created_at,
        }));
    },

    getProjectDiffPatch(projectId: string, diffId: string): { diffId: string; patch: string } {
      const project = projects.getProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }
      const workspace = resolvePaths(project);
      const rows = this.listProjectDiffs(projectId);
      const index = rows.findIndex((row) => row.diffId === diffId);
      if (index < 0) {
        throw new Error(`Diff not found: ${diffId}`);
      }
      const patch = getGitPatch(workspace.repo, rows.length - 1 - index);
      return { diffId, patch };
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
