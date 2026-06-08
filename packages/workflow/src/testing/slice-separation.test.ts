import { describe, expect, it } from "vitest";
import { isFinalSuite, isSliceSuite } from "@oc/shared";
import { loadTestResults } from "./results.js";
import { persistRunnerResult } from "./results.js";
import { setupTestDb, seedProject } from "../test-utils.js";

describe("slice vs final separation", () => {
  it("keeps slice and final results in separate query buckets", () => {
    const { db, cleanup } = setupTestDb();
    try {
      const projectId = seedProject(db);
      persistRunnerResult(db, projectId, { suite: "slice:slice-1", status: "passed" });
      persistRunnerResult(db, projectId, { suite: "final:typecheck", status: "passed" });

      const sliceRows = loadTestResults(db, projectId, "slice");
      const finalRows = loadTestResults(db, projectId, "final");

      expect(sliceRows.every((r) => isSliceSuite(r.suite))).toBe(true);
      expect(finalRows.every((r) => isFinalSuite(r.suite))).toBe(true);
      expect(sliceRows.some((r) => isFinalSuite(r.suite))).toBe(false);
    } finally {
      cleanup();
    }
  });
});
