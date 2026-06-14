import { describe, expect, it } from "vitest";
import { setupTestApp } from "../test-utils.js";

describe("project MCP routes", () => {
  it("presets MCP servers on project creation", async () => {
    const { app, cleanup } = setupTestApp();
    try {
      const created = await app.request("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "MCP Demo" }),
      });
      const project = (await created.json()) as { id: string };

      const response = await app.request(`/projects/${project.id}/mcp`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as { servers: Array<{ presetId: string }> };
      const ids = body.servers.map((s) => s.presetId).sort();
      expect(ids).toContain("codegraph");
      expect(ids).toContain("context7");
    } finally {
      cleanup();
    }
  });

  it("adds, updates, and deletes an MCP server by presetId", async () => {
    const { app, cleanup } = setupTestApp();
    try {
      const created = await app.request("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "MCP CRUD" }),
      });
      const project = (await created.json()) as { id: string };

      // Add context7 (already preset, so this upserts).
      const addResponse = await app.request(`/projects/${project.id}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presetId: "context7",
          displayName: "Context7",
          enabled: true,
        }),
      });
      expect(addResponse.status).toBe(201);

      // Disable it via PATCH.
      const patchResponse = await app.request(
        `/projects/${project.id}/mcp/context7`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: false }),
        },
      );
      expect(patchResponse.status).toBe(200);
      const patched = (await patchResponse.json()) as { enabled: boolean };
      expect(patched.enabled).toBe(false);

      // Delete it.
      const deleteResponse = await app.request(
        `/projects/${project.id}/mcp/context7`,
        { method: "DELETE" },
      );
      expect(deleteResponse.status).toBe(200);

      const afterDelete = (await (await app.request(`/projects/${project.id}/mcp`)).json()) as {
        servers: Array<{ presetId: string }>;
      };
      expect(afterDelete.servers.some((s) => s.presetId === "context7")).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("returns 404 for unknown project", async () => {
    const { app, cleanup } = setupTestApp();
    try {
      const response = await app.request("/projects/nonexistent/mcp");
      expect(response.status).toBe(404);
    } finally {
      cleanup();
    }
  });

  it("rejects unknown presetId (no arbitrary command accepted)", async () => {
    const { app, cleanup } = setupTestApp();
    try {
      const created = await app.request("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Reject Test" }),
      });
      const project = (await created.json()) as { id: string };

      // An unknown presetId must be rejected — this is the core security property.
      const response = await app.request(`/projects/${project.id}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presetId: "evil-preset",
          displayName: "Evil",
          enabled: true,
        }),
      });
      expect(response.status).toBe(400);
    } finally {
      cleanup();
    }
  });

  it("does not accept a command field (presetId-only API)", async () => {
    const { app, cleanup } = setupTestApp();
    try {
      const created = await app.request("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "No Command" }),
      });
      const project = (await created.json()) as { id: string };

      // Even a "valid-looking" command array is rejected — the API schema
      // doesn't have a command field, so zod drops it and presetId is required.
      const response = await app.request(`/projects/${project.id}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presetId: "codegraph",
          displayName: "CG",
          command: ["sh", "-c", "rm -rf /"], // must be ignored
          enabled: true,
        }),
      });
      expect(response.status).toBe(201);
      // Verify the stored config has no command field.
      const list = (await (await app.request(`/projects/${project.id}/mcp`)).json()) as {
        servers: Array<{ presetId: string; command?: unknown }>;
      };
      const cg = list.servers.find((s) => s.presetId === "codegraph");
      expect(cg?.command).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it("stores secretRefs, not secret values, and does not echo values", async () => {
    const { app, cleanup } = setupTestApp();
    try {
      const created = await app.request("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Secret Test" }),
      });
      const project = (await created.json()) as { id: string };

      await app.request(`/projects/${project.id}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presetId: "context7",
          displayName: "Context7",
          secretRefs: { API_KEY: "MY_CONTEXT7_KEY" },
          enabled: true,
        }),
      });

      const list = (await (await app.request(`/projects/${project.id}/mcp`)).json()) as {
        servers: Array<{ presetId: string; secretRefs?: Record<string, string> }>;
      };
      const ctx = list.servers.find((s) => s.presetId === "context7");
      // secretRefs stores the env-var NAME reference, never the value.
      expect(ctx?.secretRefs?.API_KEY).toBe("MY_CONTEXT7_KEY");
    } finally {
      cleanup();
    }
  });
});
