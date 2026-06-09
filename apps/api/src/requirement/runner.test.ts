import { describe, expect, it } from "vitest";
import { createRequirementRunner } from "@oc/agent-core";
import { setupTestApp } from "../test-utils.js";

describe("requirement runner factory — M9.5", () => {
  it("uses scripted runner in stub mode", async () => {
    const previous = process.env.OC_USE_STUB_ENGINE;
    process.env.OC_USE_STUB_ENGINE = "1";
    const { db, cleanup } = setupTestApp();
    try {
      const runner = createRequirementRunner(db, { mode: "stub" });
      const result = await runner({ projectId: "p1", db }, "intake@1.0.0", {
        state: {
          projectId: "p1",
          rawRequirement: "build a todo app",
          questionRounds: [],
          maxQuestionRounds: 3,
        },
        profile: "vague",
      });
      expect(result.output).toBeTruthy();
    } finally {
      if (previous === undefined) delete process.env.OC_USE_STUB_ENGINE;
      else process.env.OC_USE_STUB_ENGINE = previous;
      cleanup();
    }
  });

});
