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

  it("POST /projects/:id/commands returns gateId when gate rejects high-risk command", async () => {
    const { app, gates, cleanup } = setupTestApp();
    try {
      const created = await app.request("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Gate Reject Demo" }),
      });
      const project = (await created.json()) as { id: string };

      gates.waitForGate = async () => "reject";

      const response = await app.request(`/projects/${project.id}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd: "npm install lodash" }),
      });

      expect(response.status).toBe(403);
      const body = (await response.json()) as { error: string; gateId?: string; gateType?: string };
      expect(body.error).toContain("rejected by gate");
      expect(body.gateId).toBeTruthy();
      expect(body.gateType).toBe("dangerous_operation");
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

  // Regression for the artifacts path-traversal vulnerability: the artifacts
  // branch of readProjectFile must reject "..", absolute paths, and symlinks
  // that escape the artifacts root. These cases must never return 200 with
  // out-of-scope file contents.
  it("GET /projects/:id/files rejects artifacts path traversal attempts", async () => {
    const { app, generatedProjectsRoot, cleanup } = setupTestApp();
    try {
      const created = await app.request("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Traversal Demo" }),
      });
      const project = (await created.json()) as { id: string; slug: string };

      // Place a secret OUTSIDE the artifacts root, and a symlink inside it.
      const artifactsDir = path.join(generatedProjectsRoot, project.slug, "artifacts");
      fs.mkdirSync(artifactsDir, { recursive: true });
      const outsideSecret = path.join(generatedProjectsRoot, "outside-secret.txt");
      fs.writeFileSync(outsideSecret, "outside-secret-content");
      fs.writeFileSync(path.join(artifactsDir, "legit.txt"), "legit-content");
      try {
        fs.symlinkSync(outsideSecret, path.join(artifactsDir, "leak.txt"));
      } catch {
        // symlink creation can fail on some CI sandboxes; the ".." case below
        // still covers the containment guarantee.
      }

      // ".." traversal must be rejected (this was the original vulnerability).
      const traversal = await app.request(
        `/projects/${project.id}/files?path=artifacts/../../outside-secret.txt`,
      );
      expect(traversal.status).toBe(400);
      const traversalBody = (await traversal.json()) as { content?: string };
      expect(traversalBody.content).not.toBe("outside-secret-content");

      // Absolute paths must be rejected.
      const absolute = await app.request(
        `/projects/${project.id}/files?path=${encodeURIComponent(outsideSecret)}`,
      );
      expect(absolute.status).toBe(400);

      // A legit artifacts file still resolves (guards against over-blocking).
      const legit = await app.request(
        `/projects/${project.id}/files?path=artifacts/legit.txt`,
      );
      expect(legit.status).toBe(200);
      const legitBody = (await legit.json()) as { content: string };
      expect(legitBody.content).toBe("legit-content");

      // A symlink inside artifacts pointing outside must NOT leak the target.
      const symlinkPath = path.join(artifactsDir, "leak.txt");
      if (fs.existsSync(symlinkPath)) {
        const symlink = await app.request(
          `/projects/${project.id}/files?path=${encodeURIComponent(`artifacts/leak.txt`)}`,
        );
        expect(symlink.status).toBe(400);
        const symlinkBody = (await symlink.json()) as { content?: string };
        expect(symlinkBody.content).not.toBe("outside-secret-content");
      }
    } finally {
      cleanup();
    }
  });
});
