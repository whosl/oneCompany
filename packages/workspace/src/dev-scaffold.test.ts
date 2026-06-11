import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ensureDevRepoScaffold,
  findVitestMjs,
  normalizeSliceTestCommand,
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

  it("rewrites pytest commands to vitest when a matching .test.ts exists", () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), "oc-pytest-"));
    tempDirs.push(repoPath);
    ensureDevRepoScaffold(repoPath);
    fs.mkdirSync(path.join(repoPath, "tests"), { recursive: true });
    fs.writeFileSync(
      path.join(repoPath, "tests", "test_slice1_position_resume.test.ts"),
      "import { describe, it, expect } from 'vitest';\ndescribe('x', () => { it('y', () => expect(1).toBe(1)); });\n",
    );

    const resolved = normalizeSliceTestCommand(
      repoPath,
      "pytest tests/test_slice1_position_resume.py -v",
      "slice-1",
    );
    expect(resolved).toContain("vitest");
    expect(resolved).toContain("test_slice1_position_resume.test.ts");
    expect(resolved).not.toContain("pytest");
  });
});
