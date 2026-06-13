import { describe, expect, it } from "vitest";
import { setupTestApp } from "../test-utils.js";

describe("project MCP routes", () => {
  it("presets three MCP servers on project creation", async () => {
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
      const body = (await response.json()) as { servers: Array<{ serverId: string }> };
      const ids = body.servers.map((s) => s.serverId).sort();
      expect(ids).toEqual(["codegraph", "context7", "web-search"]);
    } finally {
      cleanup();
    }
  });

  it("adds, updates, and deletes an MCP server", async () => {
    const { app, cleanup } = setupTestApp();
    try {
      const created = await app.request("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "MCP CRUD" }),
      });
      const project = (await created.json()) as { id: string };

      // Add a custom server.
      const addResponse = await app.request(`/projects/${project.id}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverId: "custom",
          displayName: "Custom MCP",
          transport: "local",
          command: ["node", "server.js"],
          enabled: true,
        }),
      });
      expect(addResponse.status).toBe(201);

      // It appears in the list alongside the presets.
      const list = (await (await app.request(`/projects/${project.id}/mcp`)).json()) as {
        servers: Array<{ serverId: string; enabled: boolean }>;
      };
      expect(list.servers.some((s) => s.serverId === "custom")).toBe(true);

      // Disable it via PATCH.
      const patchResponse = await app.request(
        `/projects/${project.id}/mcp/custom`,
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
        `/projects/${project.id}/mcp/custom`,
        { method: "DELETE" },
      );
      expect(deleteResponse.status).toBe(200);

      const afterDelete = (await (await app.request(`/projects/${project.id}/mcp`)).json()) as {
        servers: Array<{ serverId: string }>;
      };
      expect(afterDelete.servers.some((s) => s.serverId === "custom")).toBe(false);
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
});
