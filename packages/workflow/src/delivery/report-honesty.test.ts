import fs from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { emit } from "@oc/shared";
import { initRepo } from "@oc/workspace";
import {
  assertDeliveryReportAllowed,
  collectHonestyRisks,
  DeliveryReportStatusError,
  scanRepoMockMarkers,
} from "./report-honesty.js";
import { buildDeliveryReportSections } from "./report-generator.js";
import { seedTestingProject, setupTestDb } from "../test-utils.js";

describe("delivery report honesty", () => {
  it("rejects report generation outside acceptance phases", () => {
    expect(() => assertDeliveryReportAllowed("Developing")).toThrow(DeliveryReportStatusError);
    expect(() => assertDeliveryReportAllowed("Awaiting Acceptance")).not.toThrow();
  });

  it("lists [MOCK] markers and missing env keys in report risks", () => {
    const { db, cleanup } = setupTestDb();
    const repoPath = mkdtempSync(path.join(tmpdir(), "oc-honesty-repo-"));
    const artifactsPath = mkdtempSync(path.join(tmpdir(), "oc-honesty-artifacts-"));
    initRepo(repoPath);
    const { projectId, payload } = seedTestingProject(db, repoPath);

    try {
      fs.mkdirSync(path.join(repoPath, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(repoPath, "src", "api.ts"),
        "export const mode = '[MOCK]';\n",
        "utf8",
      );
      expect(scanRepoMockMarkers(repoPath)).toContain("src/api.ts");

      emit(db, {
        projectId,
        payload: {
          type: "environment.missing_key",
          projectId,
          keyName: "OPENAI_API_KEY",
          message: "Missing OPENAI_API_KEY",
        },
      });

      const sections = buildDeliveryReportSections(
        { db },
        {
          projectId,
          repoPath,
          artifactsPath,
          stateRisks: payload.state.risks,
        },
      );
      const risks = sections.find((section) => section.id === "risks-and-limitations");
      expect(risks?.content).toContain("[MOCK]");
      expect(risks?.content).toContain("OPENAI_API_KEY");
    } finally {
      cleanup();
      rmSync(repoPath, { recursive: true, force: true });
      rmSync(artifactsPath, { recursive: true, force: true });
    }
  });

  it("collectHonestyRisks includes redaction incidents", () => {
    const { db, cleanup } = setupTestDb();
    const projectId = seedTestingProject(db, mkdtempSync(path.join(tmpdir(), "oc-honesty-"))).projectId;
    try {
      emit(db, {
        projectId,
        payload: {
          type: "agent.error",
          projectId,
          agentId: "qa",
          runId: "run-1",
          message: "token sk-test1234567890abcdef leaked",
        },
      });

      const risks = collectHonestyRisks(db, projectId, "/tmp/unused");
      expect(risks.some((risk) => risk.includes("Secret redacted"))).toBe(true);
    } finally {
      cleanup();
    }
  });
});
