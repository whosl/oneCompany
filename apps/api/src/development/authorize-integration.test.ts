import { describe, expect, it } from "vitest";
import { setupTestApp } from "../test-utils.js";
import { createDevelopmentDeps } from "./deps.js";

describe("authorize integration — M9.5", () => {
  it("allows low-risk read operations", async () => {
    const previous = process.env.OC_USE_STUB_ENGINE;
    const { db, projects, gates, workspace, cleanup } = setupTestApp();
    delete process.env.OC_USE_STUB_ENGINE;
    try {
      const project = projects.createProject("Authorize Low Risk");
      const deps = createDevelopmentDeps(
        { db, projects, gates, workspace, onEvent: () => undefined },
        project.id,
      );
      await expect(deps.authorize({ kind: "read", path: "src/index.ts" })).resolves.toEqual({
        allow: true,
      });
    } finally {
      if (previous === undefined) delete process.env.OC_USE_STUB_ENGINE;
      else process.env.OC_USE_STUB_ENGINE = previous;
      cleanup();
    }
  });

  it("blocks high-risk shell until gate rejects", async () => {
    const previous = process.env.OC_USE_STUB_ENGINE;
    const { db, projects, gates, workspace, cleanup } = setupTestApp();
    delete process.env.OC_USE_STUB_ENGINE;
    try {
      const project = projects.createProject("Authorize High Risk");
      const deps = createDevelopmentDeps(
        { db, projects, gates, workspace, onEvent: () => undefined },
        project.id,
      );

      const decisionPromise = deps.authorize({
        kind: "shell",
        command: "npm install lodash",
      });

      const open = gates.listOpenGates(project.id);
      const gate = open.find((row) => row.gateType === "dangerous_operation");
      expect(gate).toBeTruthy();
      expect(gate).toBeTruthy();
      await gates.resolveGate(gate!.id, { decision: "reject" });

      await expect(decisionPromise).resolves.toEqual({
        allow: false,
        reason: expect.stringContaining("Gate rejected"),
      });
    } finally {
      if (previous === undefined) delete process.env.OC_USE_STUB_ENGINE;
      else process.env.OC_USE_STUB_ENGINE = previous;
      cleanup();
    }
  });
});
