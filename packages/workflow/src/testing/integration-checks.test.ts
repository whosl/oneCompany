import { describe, expect, it } from "vitest";
import { runTestingPhase } from "./engine.js";
import { setupTestingTest } from "../test-utils.js";

describe("testing integration checks", () => {
  it("stores baseline artifacts and diagnostic artifacts on failure", async () => {
    const { deps, projectId, cleanup } = setupTestingTest({
      suiteResults: { "final:vitest": "failed" },
    });

    deps.runPreviewIntegrationChecks = async (_previewUrl, label) => ({
      label,
      artifacts: [
        {
          label,
          toolName: "screenshot",
          mode: "remote",
          artifactPath: `artifacts/integrations/${label}.png`,
          summary: `saved artifacts/integrations/${label}.png`,
        },
      ],
      notes: [`Preview ${label} screenshot: artifacts/integrations/${label}.png`],
    });

    try {
      const result = await runTestingPhase(deps, { projectId });
      expect(result.phase).toBe("failed");
      expect(result.integrationArtifacts?.some((item) => item.label === "baseline")).toBe(true);
      expect(result.integrationArtifacts?.some((item) => item.label === "diagnostic")).toBe(true);
      expect(result.qaNotes?.some((note) => note.includes("baseline screenshot"))).toBe(true);
    } finally {
      cleanup();
    }
  });
});
