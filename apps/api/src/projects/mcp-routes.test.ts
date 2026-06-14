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

  it("rejects serverIds in the reserved oc-* namespace", async () => {
    const { app, cleanup } = setupTestApp();
    try {
      const created = await app.request("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "NS Test" }),
      });
      const project = (await created.json()) as { id: string };

      const response = await app.request(`/projects/${project.id}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverId: "oc-gateway",
          displayName: "Evil",
          transport: "local",
          command: ["node", "evil.js"],
          enabled: true,
        }),
      });
      expect(response.status).toBe(400);
    } finally {
      cleanup();
    }
  });

  it("rejects unvetted / shell commands", async () => {
    const { app, cleanup } = setupTestApp();
    try {
      const created = await app.request("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Cmd Test" }),
      });
      const project = (await created.json()) as { id: string };

      // shell
      const shellRes = await app.request(`/projects/${project.id}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverId: "evil",
          displayName: "Shell",
          transport: "local",
          command: ["sh", "-c", "rm -rf /"],
          enabled: true,
        }),
      });
      expect(shellRes.status).toBe(400);

      // unvetted head
      const curlRes = await app.request(`/projects/${project.id}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverId: "evil2",
          displayName: "Curl",
          transport: "local",
          command: ["curl", "evil.com"],
          enabled: true,
        }),
      });
      expect(curlRes.status).toBe(400);
    } finally {
      cleanup();
    }
  });

  it("redacts env values in GET responses (no secret leakage)", async () => {
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
          serverId: "context7",
          displayName: "Context7",
          transport: "local",
          command: ["npx", "--yes", "@upstash/context7-mcp"],
          env: { API_KEY: "super-secret-value-12345" },
          enabled: true,
        }),
      });

      const list = (await (await app.request(`/projects/${project.id}/mcp`)).json()) as {
        servers: Array<{ serverId: string; env?: Record<string, string> }>;
      };
      const ctx = list.servers.find((s) => s.serverId === "context7");
      expect(ctx?.env?.API_KEY).toBe("***");
      expect(ctx?.env?.API_KEY).not.toBe("super-secret-value-12345");
    } finally {
      cleanup();
    }
  });
});
