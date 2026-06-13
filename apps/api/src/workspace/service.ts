import path from "node:path";
import fs from "node:fs";
import { and, desc, eq } from "drizzle-orm";
import { MINIMAL_PNG } from "@oc/integrations";
import {
  acceptanceCriteriaVersions,
  diffs,
  prdVersions,
  techPlanVersions,
  resolveScopedPath,
  type FileScope,
} from "@oc/shared";
import {
  ensureWorkspace,
  getGitPatch,
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

const BINARY_ARTIFACT_EXT = /\.(png|jpe?g|gif|webp)$/i;

function findNewestPlaywrightScreenshot(integrationsDir: string): string | undefined {
  if (!fs.existsSync(integrationsDir)) return undefined;
  const candidates = fs
    .readdirSync(integrationsDir)
    .filter((name) => /^playwright-.*\.png$/i.test(name))
    .map((name) => path.join(integrationsDir, name))
    .filter((full) => fs.existsSync(full))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return candidates[0];
}

/**
 * Resolve an artifact relative path to an on-disk file. Handles legacy mock
 * paths (`playwright-screenshot.png`) that were advertised but never written.
 *
 * The relative path is validated through `resolveScopedPath` so that `..`
 * segments, absolute paths, null bytes, and symlinks that escape the artifacts
 * root are rejected before any filesystem read happens.
 */
function resolveArtifactDiskPath(artifactsRoot: string, artifactRelative: string): string | undefined {
  const direct = resolveScopedPath(artifactsRoot, artifactRelative);
  if (fs.existsSync(direct)) return direct;

  if (artifactRelative === "playwright-screenshot.png" || artifactRelative === "figma-export.png") {
    const integrationsDir = path.join(artifactsRoot, "integrations");
    const newest = findNewestPlaywrightScreenshot(integrationsDir);
    if (newest) return newest;

    // Last resort: materialize a placeholder so mock-era runs become openable.
    fs.mkdirSync(artifactsRoot, { recursive: true });
    fs.writeFileSync(direct, MINIMAL_PNG);
    return direct;
  }

  return undefined;
}

/**
 * Resolves DB-backed virtual artifacts (`artifacts/{projectId}/{version}.md`)
 * that have no on-disk counterpart: PRD, acceptance criteria, and tech plan
 * versions. `prd-latest` / `ac-latest` / `tp-latest` resolve to the newest row.
 */
function readDbArtifact(db: Db, projectId: string, relativePath: string): string | undefined {
  const base = path.basename(relativePath).replace(/\.md$/, "");
  const match = /^(prd|ac|tp)-(\d+|latest)$/.exec(base);
  if (!match) return undefined;

  const table =
    match[1] === "prd"
      ? prdVersions
      : match[1] === "ac"
        ? acceptanceCriteriaVersions
        : techPlanVersions;

  const byProject = eq(table.project_id, projectId);
  const row =
    match[2] === "latest"
      ? db
          .select({ content: table.content })
          .from(table)
          .where(byProject)
          .orderBy(desc(table.created_at))
          .get()
      : db
          .select({ content: table.content })
          .from(table)
          .where(and(byProject, eq(table.version, base)))
          .get();
  return row?.content;
}

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
      waitForGate: (gateId) => gates.waitForGate(gateId, { timeoutMs: 0 }),
      runLocal: runLocalCommand,
      runSandbox: (cmd, projectPath, env) => runInSandbox(projectPath, cmd, env),
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
    ): {
      path: string;
      scope: "repo" | "artifacts";
      content: string;
      binary?: boolean;
      absolutePath?: string;
    } {
      const project = projects.getProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }
      const workspace = resolvePaths(project);

      if (scope === "artifacts" || relativePath.startsWith("artifacts/")) {
        const artifactPath = relativePath.replace(/^artifacts\//, "");
        const diskPath = resolveArtifactDiskPath(workspace.artifacts, artifactPath);
        if (diskPath) {
          if (BINARY_ARTIFACT_EXT.test(artifactPath)) {
            return {
              path: relativePath,
              scope: "artifacts",
              content: "",
              binary: true,
              absolutePath: diskPath,
            };
          }
          return {
            path: relativePath,
            scope: "artifacts",
            content: fs.readFileSync(diskPath, "utf8"),
          };
        }
        const dbContent = readDbArtifact(db, projectId, relativePath);
        if (dbContent !== undefined) {
          return { path: relativePath, scope: "artifacts", content: dbContent };
        }
        throw new Error(`Artifact not found: ${relativePath}`);
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
