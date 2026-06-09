import { describe, expect, it } from "vitest";
import { createRequirementAuthorize, type RequirementServiceContext } from "./deps.js";
import { setupTestApp } from "../test-utils.js";

describe("requirement deps — M11", () => {
  it("uses governed authorize in real mode", async () => {
    const previous = process.env.OC_USE_STUB_ENGINE;
    const { db, projects, gates, workspace, cleanup } = setupTestApp();
    delete process.env.OC_USE_STUB_ENGINE;
    try {
      const project = projects.createProject("Requirement Deps");
      const ctx: RequirementServiceContext = {
        db,
        projects,
        gates,
        workspace,
        onEvent: () => undefined,
      };
      const authorize = createRequirementAuthorize(ctx, project.id, "real");
      expect(await authorize({ kind: "read", path: "src/index.ts" })).toEqual({
        allow: true,
      });
      expect(await authorize({ kind: "read", path: "../outside.txt" })).toEqual({
        allow: false,
        reason: "Path escapes project root",
      });
    } finally {
      if (previous === undefined) {
        delete process.env.OC_USE_STUB_ENGINE;
      } else {
        process.env.OC_USE_STUB_ENGINE = previous;
      }
      cleanup();
    }
  });
});
