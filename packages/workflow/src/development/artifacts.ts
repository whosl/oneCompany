import { desc, eq } from "drizzle-orm";
import {
  acceptanceCriteriaVersions,
  prdVersions,
  techPlanVersions,
  type Db,
} from "@oc/shared";

export function loadLatestPrd(db: Db, projectId: string): { version: string; content: string } {
  const row = db
    .select()
    .from(prdVersions)
    .where(eq(prdVersions.project_id, projectId))
    .orderBy(desc(prdVersions.created_at))
    .all()[0];

  if (!row) {
    throw new Error(`PRD not found for project: ${projectId}`);
  }

  return { version: row.version, content: row.content };
}

export function loadLatestAcceptance(
  db: Db,
  projectId: string,
): { version: string; content: string } {
  const row = db
    .select()
    .from(acceptanceCriteriaVersions)
    .where(eq(acceptanceCriteriaVersions.project_id, projectId))
    .orderBy(desc(acceptanceCriteriaVersions.created_at))
    .all()[0];

  if (!row) {
    throw new Error(`Acceptance criteria not found for project: ${projectId}`);
  }

  return { version: row.version, content: row.content };
}

export function loadLatestTechPlan(
  db: Db,
  projectId: string,
): { version: string; content: string } {
  const row = db
    .select()
    .from(techPlanVersions)
    .where(eq(techPlanVersions.project_id, projectId))
    .orderBy(desc(techPlanVersions.created_at))
    .all()[0];

  if (!row) {
    throw new Error(`Tech plan not found for project: ${projectId}`);
  }

  return { version: row.version, content: row.content };
}
