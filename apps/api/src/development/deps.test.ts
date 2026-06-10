import { describe, expect, it } from "vitest";
import { StubHarness } from "@oc/agent-core";
import { createDevelopmentDeps } from "./deps.js";
import type { DevelopmentServiceContext } from "./deps.js";
import { setupTestApp } from "../test-utils.js";

describe("development deps — M9.5", () => {
  it("uses StubHarness in stub engine mode", () => {
    const { app: _app, db, projects, gates, workspace, cleanup } = setupTestApp();
    try {
      const project = projects.createProject("Deps Test");
      const ctx: DevelopmentServiceContext = { db, projects, gates, workspace, onEvent: () => undefined };
      const deps = createDevelopmentDeps(ctx, project.id);
      expect(deps.harness).toBe(StubHarness);
    } finally {
      cleanup();
    }
  });

  it("rejects stub engine in production", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousStub = process.env.OC_USE_STUB_ENGINE;
    const { db, projects, gates, workspace, cleanup } = setupTestApp();
    process.env.NODE_ENV = "production";
    process.env.OC_USE_STUB_ENGINE = "1";

    try {
      const project = projects.createProject("Prod Stub");
      const ctx: DevelopmentServiceContext = { db, projects, gates, workspace, onEvent: () => undefined };
      expect(() => createDevelopmentDeps(ctx, project.id)).toThrow(/never in production/i);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      if (previousStub === undefined) {
        delete process.env.OC_USE_STUB_ENGINE;
      } else {
        process.env.OC_USE_STUB_ENGINE = previousStub;
      }
      cleanup();
    }
  });

  it("uses OpencodeHarness and createAuthorize in real mode", async () => {
    const previous = process.env.OC_USE_STUB_ENGINE;
    const { db, projects, gates, workspace, cleanup } = setupTestApp();
    delete process.env.OC_USE_STUB_ENGINE; // after setupTestApp — it forces stub=1
    try {
      const project = projects.createProject("Real Deps Test");
      const ctx: DevelopmentServiceContext = { db, projects, gates, workspace, onEvent: () => undefined };
      const deps = createDevelopmentDeps(ctx, project.id);
      expect(deps.harness).not.toBe(StubHarness);
      const decision = await deps.authorize({ kind: "read", path: "src/index.ts" });
      expect(decision).toEqual({ allow: true });
    } finally {
      process.env.OC_USE_STUB_ENGINE = "1";
      if (previous === undefined) {
        delete process.env.OC_USE_STUB_ENGINE;
      } else {
        process.env.OC_USE_STUB_ENGINE = previous;
      }
      cleanup();
    }
  });
});
