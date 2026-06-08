import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { events, projects, testResults } from "@oc/shared";
import { persistRunnerResult, loadTestResults } from "./results.js";
import { setupTestDb, seedProject } from "../test-utils.js";

describe("testing results persistence", () => {
  it("writes test_results and emits test.result for final suite", () => {
    const { db, cleanup } = setupTestDb();
    try {
      const projectId = seedProject(db, "Testing Results");
      setProjectTesting(db, projectId);

      persistRunnerResult(db, projectId, {
        suite: "final:vitest",
        status: "passed",
        details: "vitest: failed=0, passed=2",
      });

      const rows = db
        .select()
        .from(testResults)
        .where(eq(testResults.project_id, projectId))
        .all();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.suite).toBe("final:vitest");

      const eventRows = db
        .select()
        .from(events)
        .where(eq(events.project_id, projectId))
        .all();
      const testEvent = eventRows.find((row) => {
        const payload = JSON.parse(row.payload) as { type: string; suite?: string };
        return payload.type === "test.result" && payload.suite === "final:vitest";
      });
      expect(testEvent).toBeTruthy();
    } finally {
      cleanup();
    }
  });

  it("filters slice vs final prefixes", () => {
    const { db, cleanup } = setupTestDb();
    try {
      const projectId = seedProject(db);
      persistRunnerResult(db, projectId, { suite: "slice:slice-1", status: "passed" });
      persistRunnerResult(db, projectId, { suite: "final:build", status: "failed" });

      expect(loadTestResults(db, projectId, "slice")).toHaveLength(1);
      expect(loadTestResults(db, projectId, "final")).toHaveLength(1);
    } finally {
      cleanup();
    }
  });
});

function setProjectTesting(db: ReturnType<typeof setupTestDb>["db"], projectId: string): void {
  const now = new Date().toISOString();
  db.update(projects)
    .set({ status: "Testing", updated_at: now })
    .where(eq(projects.id, projectId))
    .run();
}
