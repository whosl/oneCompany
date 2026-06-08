import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { setupTestApp } from "../test-utils.js";

describe("workspace API — M5", () => {
  it("POST /projects creates generated-projects workspace with meta.json", async () => {
    const { app, generatedProjectsRoot, cleanup } = setupTestApp();
    try {
      const response = await app.request("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Workspace Demo" }),
      });

      expect(response.status).toBe(201);
      const project = (await response.json()) as { id: string; slug: string };
      const metaPath = path.join(generatedProjectsRoot, project.slug, "meta.json");
      expect(fs.existsSync(metaPath)).toBe(true);

      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as { projectId: string };
      expect(meta.projectId).toBe(project.id);
    } finally {
      cleanup();
    }
  });

  it("GET /projects/:id/files returns repo file paths", async () => {
    const { app, cleanup } = setupTestApp();
    try {
      const created = await app.request("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Files Demo" }),
      });
      const project = (await created.json()) as { id: string };

      const commandResponse = await app.request(`/projects/${project.id}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd: "touch demo.ts" }),
      });
      expect(commandResponse.status).toBe(200);

      const response = await app.request(`/projects/${project.id}/files`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as { files: string[] };
      expect(body.files).toContain("demo.ts");
    } finally {
      cleanup();
    }
  });

  it("POST /projects/:id/commands runs low-risk commands", async () => {
    const { app, cleanup } = setupTestApp();
    try {
      const created = await app.request("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Command Demo" }),
      });
      const project = (await created.json()) as { id: string };

      const response = await app.request(`/projects/${project.id}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd: "ls" }),
      });

      expect(response.status).toBe(200);
      const result = (await response.json()) as {
        exitCode: number;
        outputRef: { kind: string; text?: string };
      };
      expect(result.exitCode).toBe(0);
      expect(result.outputRef.kind).toBe("inline");
    } finally {
      cleanup();
    }
  });
});
