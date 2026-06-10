import fs from "node:fs";
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
});
