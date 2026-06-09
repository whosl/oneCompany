import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ensureDevRepoScaffold,
  findVitestMjs,
  resolveSliceTestCommand,
} from "./dev-scaffold.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("dev repo scaffold", () => {
  it("writes a minimal TypeScript + vitest layout once", () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), "oc-scaffold-"));
    tempDirs.push(repoPath);

    ensureDevRepoScaffold(repoPath);
    expect(fs.existsSync(path.join(repoPath, "package.json"))).toBe(true);
    expect(fs.existsSync(path.join(repoPath, "tsconfig.json"))).toBe(true);
    expect(fs.existsSync(path.join(repoPath, "vitest.config.ts"))).toBe(true);
    expect(fs.existsSync(path.join(repoPath, "src"))).toBe(true);

    const before = fs.readFileSync(path.join(repoPath, "package.json"), "utf8");
    ensureDevRepoScaffold(repoPath);
    expect(fs.readFileSync(path.join(repoPath, "package.json"), "utf8")).toBe(before);
  });

  it("resolves pnpm vitest commands to the workspace vitest binary", () => {
    const vitestMjs = findVitestMjs(process.cwd());
    expect(vitestMjs).toBeTruthy();

    const resolved = resolveSliceTestCommand(
      process.cwd(),
      "pnpm vitest run src/add.test.ts --reporter=json",
    );
    expect(resolved).toContain(vitestMjs!);
    expect(resolved).toContain("src/add.test.ts");
  });
});
