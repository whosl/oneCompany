import { eq } from "drizzle-orm";
import { artifacts, type Db } from "@oc/shared";

export function loadArtifactsForProject(
  db: Db,
  projectId: string,
): Array<{ artifactId: string; path: string; kind: string }> {
  return db
    .select()
    .from(artifacts)
    .where(eq(artifacts.project_id, projectId))
    .all()
    .map((row) => ({
      artifactId: row.artifact_id,
      path: row.path,
      kind: row.kind,
    }));
}
