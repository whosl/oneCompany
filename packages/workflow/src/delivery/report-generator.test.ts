import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { artifacts } from "@oc/shared";
import { initRepo } from "@oc/workspace";
import { buildDeliveryReportSections, generateDeliveryReport } from "./report-generator.js";
import { assertReportComplete } from "./report-sections.js";
import { DELIVERY_REPORT_SECTION_IDS } from "./report-sections.js";
import { seedTestingProject, setupTestDb } from "../test-utils.js";

describe("delivery report generator", () => {
  it("includes every spec section and writes delivery-report.md", () => {
    const { db, cleanup } = setupTestDb();
    const repoPath = mkdtempSync(path.join(tmpdir(), "oc-report-repo-"));
    const artifactsPath = mkdtempSync(path.join(tmpdir(), "oc-report-artifacts-"));
    initRepo(repoPath);
    const { projectId, payload } = seedTestingProject(db, repoPath);

    try {
      const sections = buildDeliveryReportSections(
        { db },
        {
          projectId,
          repoPath,
          artifactsPath,
          previewUrl: "http://127.0.0.1:4173",
          deploymentUrl: "https://demo.trycloudflare.com",
          stateRisks: ["force_continue recorded in requirement phase"],
          taskTitles: payload.state.taskQueue.map((task) => task.title),
        },
      );
      assertReportComplete(sections);
      expect(sections.map((section) => section.id)).toEqual([...DELIVERY_REPORT_SECTION_IDS]);
      const risks = sections.find((section) => section.id === "risks-and-limitations");
      expect(risks?.content).toContain("force_continue");

      const result = generateDeliveryReport(
        { db },
        {
          projectId,
          repoPath,
          artifactsPath,
          stateRisks: payload.state.risks,
        },
      );
      expect(result.relativePath).toBe("delivery-report.md");
      expect(db.select().from(artifacts).all().length).toBeGreaterThan(0);
    } finally {
      cleanup();
      rmSync(repoPath, { recursive: true, force: true });
      rmSync(artifactsPath, { recursive: true, force: true });
    }
  });
});
