import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPlaywrightNativeAdapter } from "./playwright.js";

describe("playwright native adapter", () => {
  let server: http.Server;
  let port = 0;
  let artifactsPath = "";

  beforeAll(async () => {
    artifactsPath = mkdtempSync(path.join(tmpdir(), "oc-playwright-native-"));
    server = http.createServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end("<html><body><h1>Preview</h1></body></html>");
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to bind preview test server");
    }
    port = address.port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    rmSync(artifactsPath, { recursive: true, force: true });
  });

  it("captures a screenshot artifact when chromium is available", async () => {
    const adapter = createPlaywrightNativeAdapter();
    try {
      const result = (await adapter.callTool("screenshot", {
        projectId: "project-test",
        args: { previewUrl: `http://127.0.0.1:${port}`, label: "baseline" },
        artifactsPath,
      })) as { path: string };

      expect(result.path).toContain("artifacts/integrations/playwright-baseline");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Executable doesn't exist") || message.includes("browserType.launch")) {
        return;
      }
      throw error;
    }
  });
});
