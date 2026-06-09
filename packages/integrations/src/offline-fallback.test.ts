import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { callIntegrationTool } from "./call-tool.js";
import { enableIntegrationForProject } from "./connection.js";
import { seedTestProject, setupIntegrationTestDb } from "./test-utils.js";

describe("offline fallback — M12", () => {
  it("uses skill packs in offline mode without claiming remote success", async () => {
    const previous = process.env.OC_OFFLINE_MODE;
    const previousRoot = process.env.OC_SKILL_PACKS_ROOT;
    const skillRoot = path.resolve(process.cwd(), "../../skill-packs");
    process.env.OC_OFFLINE_MODE = "1";
    process.env.OC_SKILL_PACKS_ROOT = skillRoot;

    const { db, cleanup } = setupIntegrationTestDb();
    const artifactsPath = mkdtempSync(path.join(tmpdir(), "oc-offline-artifacts-"));
    try {
      const projectId = seedTestProject(db);
      await enableIntegrationForProject(db, {
        projectId,
        integrationId: "github",
        scopes: ["repo:read"],
      });

      const result = await callIntegrationTool(
        { db, projectId, artifactsPath, skillPacksRoot: skillRoot },
        { integrationId: "github", toolName: "open_pr" },
      );

      expect(result.mode).toBe("offline");
      const payload = result.output as { manualFollowUpRequired?: boolean };
      expect(payload.manualFollowUpRequired).toBe(true);
      expect(result.artifactPath).toContain("integrations/github-offline-open_pr-offline.md");
    } finally {
      cleanup();
      rmSync(artifactsPath, { recursive: true, force: true });
      if (previous === undefined) {
        delete process.env.OC_OFFLINE_MODE;
      } else {
        process.env.OC_OFFLINE_MODE = previous;
      }
      if (previousRoot === undefined) {
        delete process.env.OC_SKILL_PACKS_ROOT;
      } else {
        process.env.OC_SKILL_PACKS_ROOT = previousRoot;
      }
    }
  });
});
