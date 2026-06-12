import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertWebLayerDelivered,
  isPlaceholderWebPage,
  writeMinimalProductWeb,
} from "./web-layer.js";
import { ensureDevRepoScaffold } from "./dev-scaffold.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("web layer validation", () => {
  it("detects scaffold placeholder HTML", () => {
    expect(
      isPlaceholderWebPage(
        '<body data-testid="app-shell"><h1 data-testid="app-title">generated-app</h1></body>',
      ),
    ).toBe(true);
    expect(
      isPlaceholderWebPage(
        '<body data-testid="app-shell"><main data-testid="app-page"><h1 data-testid="app-title">AI 面试助手</h1></main></body>',
      ),
    ).toBe(false);
  });

  it("fails scaffold-only repo after ensureDevRepoScaffold", () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), "oc-web-layer-"));
    tempDirs.push(repoPath);
    ensureDevRepoScaffold(repoPath);

    const check = assertWebLayerDelivered(repoPath, { allowPlaceholder: false });
    expect(check.ok).toBe(false);
    expect(check.details).toContain("generated-app");
  });

  it("passes when minimal product web is written", () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), "oc-web-product-"));
    tempDirs.push(repoPath);
    writeMinimalProductWeb(repoPath, "AI 面试助手");

    const check = assertWebLayerDelivered(repoPath, { allowPlaceholder: false });
    expect(check.ok).toBe(true);
  });
});
