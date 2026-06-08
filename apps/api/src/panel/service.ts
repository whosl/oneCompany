import { desc, eq } from "drizzle-orm";
import {
  deployments,
  parseProjectStatus,
  type Db,
  type PreviewStatus,
  type ReportSnapshot,
  type TestsResultsResponse,
} from "@oc/shared";
import {
  buildReportSnapshot,
  loadArtifactsForProject,
  loadDevSession,
  loadTestResults,
} from "@oc/workflow";
import { getPreviewHealth } from "@oc/workspace";
import type { ProjectService } from "../projects/service.js";
import type { WorkspaceService } from "../workspace/service.js";

export function createPanelService(
  db: Db,
  projects: ProjectService,
  workspace: WorkspaceService,
) {
  return {
    getTestsResults(projectId: string): TestsResultsResponse {
      const project = projects.getProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }

      const artifacts = loadArtifactsForProject(db, projectId);
      const mapRow = (row: { suite: string; status: string; details: string | null }) => ({
        suite: row.suite,
        status: row.status as TestsResultsResponse["slice"][number]["status"],
        details: row.details,
        artifacts: artifacts.filter((artifact) => artifact.path.includes(row.suite)),
      });

      const slice = loadTestResults(db, projectId, "slice").map(mapRow);
      const final = loadTestResults(db, projectId, "final").map(mapRow);

      return { slice, final };
    },

    async getPreviewStatus(projectId: string): Promise<PreviewStatus> {
      const project = projects.getProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }

      let previewUrl: string | undefined;
      try {
        const session = loadDevSession(db, projectId);
        previewUrl = session.state.previewUrl ?? session.testing?.previewUrl;
      } catch {
        previewUrl = undefined;
      }

      const deploymentRow = db
        .select()
        .from(deployments)
        .where(eq(deployments.project_id, projectId))
        .orderBy(desc(deployments.created_at))
        .all()[0];

      const finalTests = loadTestResults(db, projectId, "final");
      const playwrightReady = finalTests.some(
        (row) => row.suite === "final:playwright" && row.status === "passed",
      );

      const health = previewUrl
        ? await getPreviewHealth(previewUrl)
        : { reachable: false as const };

      return {
        previewUrl,
        deploymentUrl: deploymentRow?.url ?? undefined,
        health: {
          reachable: health.reachable,
          statusCode: health.statusCode,
          playwrightReady,
        },
      };
    },

    getReport(projectId: string): ReportSnapshot {
      const project = projects.getProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }

      const paths = workspace.ensureForProject(project);
      let previewUrl: string | undefined;
      let risks: string[] = [];
      try {
        const session = loadDevSession(db, projectId);
        previewUrl = session.state.previewUrl ?? session.testing?.previewUrl;
        risks = session.state.risks;
      } catch {
        previewUrl = undefined;
        risks = [];
      }

      return buildReportSnapshot(db, projectId, {
        projectStatus: parseProjectStatus(project.status),
        previewUrl,
        risks,
        repoPath: paths.repo,
        artifactsPath: paths.artifacts,
      });
    },

    listDiffs(projectId: string) {
      return { diffs: workspace.listProjectDiffs(projectId) };
    },

    getDiffPatch(projectId: string, diffId: string) {
      return workspace.getProjectDiffPatch(projectId, diffId);
    },
  };
}

export type PanelService = ReturnType<typeof createPanelService>;
