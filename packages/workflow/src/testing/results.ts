import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  artifacts,
  emit,
  isFinalSuite,
  isSliceSuite,
  testResults,
  type Db,
  type EventEnvelope,
  type NormalizedRunnerResult,
} from "@oc/shared";

export function persistRunnerResult(
  db: Db,
  projectId: string,
  result: NormalizedRunnerResult,
  onEvent?: (envelope: EventEnvelope) => void,
): void {
  const now = new Date().toISOString();
  db.insert(testResults)
    .values({
      id: randomUUID(),
      project_id: projectId,
      suite: result.suite,
      status: result.status,
      details: result.details ?? null,
      created_at: now,
    })
    .run();

  const envelope = emit(db, {
    projectId,
    payload: {
      type: "test.result",
      projectId,
      suite: result.suite,
      status: result.status === "passed" ? "passed" : "failed",
    },
  });
  onEvent?.(envelope);

  for (const artifactPath of result.artifactRefs ?? []) {
    const artifactId = `pw-${randomUUID().slice(0, 8)}`;
    db.insert(artifacts)
      .values({
        id: randomUUID(),
        project_id: projectId,
        artifact_id: artifactId,
        path: artifactPath,
        kind: "playwright-trace",
        created_at: now,
      })
      .run();

    const artifactEvent = emit(db, {
      projectId,
      payload: {
        type: "artifact.created",
        projectId,
        artifactId,
        path: artifactPath,
      },
    });
    onEvent?.(artifactEvent);
  }
}

export function loadTestResults(
  db: Db,
  projectId: string,
  prefix?: "slice" | "final",
): Array<{ suite: string; status: string; details: string | null }> {
  const rows = db
    .select()
    .from(testResults)
    .where(eq(testResults.project_id, projectId))
    .all();

  return rows
    .filter((row) => {
      if (prefix === "slice") {
        return isSliceSuite(row.suite);
      }
      if (prefix === "final") {
        return isFinalSuite(row.suite);
      }
      return true;
    })
    .map((row) => ({
      suite: row.suite,
      status: row.status,
      details: row.details,
    }));
}
