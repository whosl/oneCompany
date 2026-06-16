import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearPreviewRegistry,
  getPreviewHealth,
  resolvePreviewCommand,
  startPreview,
  stopPreview,
} from "./preview.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await clearPreviewRegistry();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("preview lifecycle", () => {
  it("prefers package.json dev script over fallback", () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), "oc-preview-cmd-"));
    tempDirs.push(repoPath);
    fs.writeFileSync(
      path.join(repoPath, "package.json"),
      JSON.stringify({ scripts: { dev: "node server.mjs", start: "node server.mjs" } }),
    );

    expect(resolvePreviewCommand(repoPath)).toEqual({ command: "pnpm dev", shell: true });
  });

  it("starts a reachable app from the generated repo fallback server", async () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), "oc-preview-fallback-"));
    tempDirs.push(repoPath);
    const projectId = "preview-fallback";

    const handle = await startPreview({ projectId, repoPath });
    const health = await getPreviewHealth(handle.url);
    expect(health.reachable).toBe(true);

    const response = await fetch(handle.url);
    const body = await response.text();
    expect(body).toContain("generated-app");
    expect(body).not.toContain("preview ok");

    await stopPreview(projectId);
    expect(await getPreviewHealth(handle.url)).toEqual({ reachable: false });
  });

  it("serves fallback previews under a project-scoped public base path", async () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), "oc-preview-base-"));
    tempDirs.push(repoPath);
    const projectId = "preview-base";

    const handle = await startPreview({
      projectId,
      repoPath,
      publicBasePath: `/preview/${projectId}/`,
    });

    expect(handle.publicPath).toBe(`/preview/${projectId}/`);
    const response = await fetch(`${handle.url}/preview/${projectId}/`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("generated-app");

    await stopPreview(projectId);
  });

  it("starts a dev script process for scaffolded repos", async () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), "oc-preview-dev-"));
    tempDirs.push(repoPath);

    const serverScript = `
import http from "node:http";
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 3000);
http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("app-live");
}).listen(port, host);
`.trim();
    fs.writeFileSync(path.join(repoPath, "server.mjs"), serverScript);
    fs.writeFileSync(
      path.join(repoPath, "package.json"),
      JSON.stringify({ scripts: { dev: "node server.mjs" } }),
    );

    const projectId = "preview-dev";
    const handle = await startPreview({ projectId, repoPath });
    const response = await fetch(handle.url);
    expect(await response.text()).toBe("app-live");
    await stopPreview(projectId);
  });

  // Regression: the fallback server must not serve files that escape the repo
  // root via ".." or via a symlink that points outside. Both must 403.
  it("fallback server rejects traversal and symlink escapes", async () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), "oc-preview-traversal-"));
    tempDirs.push(repoPath);

    // Secret outside the served root, plus a symlink inside it pointing out.
    const outsideSecret = path.join(os.tmpdir(), "oc-preview-outside-secret.txt");
    fs.writeFileSync(outsideSecret, "outside-secret-content");
    fs.writeFileSync(path.join(repoPath, "index.html"), "<h1>legit</h1>");
    try {
      fs.symlinkSync(outsideSecret, path.join(repoPath, "leak.txt"));
    } catch {
      // Some CI sandboxes disallow symlink creation; skip the symlink assertion
      // there — the ".." case still covers the containment guarantee.
    }

    const projectId = "preview-traversal";
    const handle = await startPreview({ projectId, repoPath });
    try {
      // fetch() normalizes "/../x" to "/x", so to exercise the server's ".."
      // containment we must send the raw path over a plain socket.
      const port = Number(new URL(handle.url).port);
      const rawGet = (rawPath: string) =>
        new Promise<{ status: number; body: string }>((resolve, reject) => {
          const req = http.request(
            { host: "127.0.0.1", port, path: rawPath, method: "GET" },
            (res) => {
              let body = "";
              res.on("data", (chunk) => (body += chunk));
              res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
            },
          );
          req.on("error", reject);
          req.end();
        });

      // ".." traversal must be forbidden.
      const traversal = await rawGet(`/../${path.basename(outsideSecret)}`);
      expect(traversal.status).toBe(403);
      expect(traversal.body).not.toContain("outside-secret-content");

      // A legit file still serves.
      const legit = await rawGet("/index.html");
      expect(legit.status).toBe(200);

      // A symlink pointing outside must be forbidden, not leak the target.
      const symlinkPath = path.join(repoPath, "leak.txt");
      if (fs.existsSync(symlinkPath)) {
        const symlink = await rawGet("/leak.txt");
        expect(symlink.status).toBe(403);
        expect(symlink.body).not.toContain("outside-secret-content");
      }
    } finally {
      await stopPreview(projectId);
      fs.rmSync(outsideSecret, { force: true });
    }
  });
});
