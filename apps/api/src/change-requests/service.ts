import { eq } from "drizzle-orm";
import {
  changeRequests,
  CreateChangeRequestInputSchema,
  type Db,
} from "@oc/shared";
import { startRequirementChangeReview } from "@oc/workflow";
import { createDevelopmentDeps, type DevelopmentServiceContext } from "../development/deps.js";
import type { ProjectService } from "../projects/service.js";

const CHANGE_ALLOWED_STATUSES = new Set(["Developing", "Testing"]);

export function createChangeRequestService(
  db: Db,
  projects: ProjectService,
  ctx: DevelopmentServiceContext,
) {
  return {
    create(
      projectId: string,
      input: unknown,
    ): { changeRequestId: string; phase: string; projectStatus: string; gateId?: string } {
      const parsed = CreateChangeRequestInputSchema.parse(input);
      const project = projects.getProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }
      if (!CHANGE_ALLOWED_STATUSES.has(project.status)) {
        throw new Error(`Change requests are not allowed in status: ${project.status}`);
      }

      const deps = createDevelopmentDeps(ctx, projectId);
      const payload = startRequirementChangeReview(deps, {
        projectId,
        summary: parsed.summary,
        details: parsed.details,
      });

      const updated = projects.getProject(projectId);
      return {
        changeRequestId: payload.meta.pendingChangeRequestId!,
        phase: payload.meta.phase,
        projectStatus: updated?.status ?? project.status,
        gateId: payload.meta.gateId,
      };
    },

    list(projectId: string) {
      return db
        .select()
        .from(changeRequests)
        .where(eq(changeRequests.project_id, projectId))
        .all()
        .map((row) => ({
          id: row.id,
          summary: row.summary,
          kind: row.kind,
          status: row.status,
          decision: row.decision,
          impactSummary: row.impact_summary,
          createdAt: row.created_at,
          resolvedAt: row.resolved_at,
        }));
    },
  };
}

export type ChangeRequestService = ReturnType<typeof createChangeRequestService>;
