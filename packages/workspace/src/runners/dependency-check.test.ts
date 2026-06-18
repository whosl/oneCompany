import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createDb } from "@oc/shared";
import { afterEach, describe, expect, it } from "vitest";
import { runDependencyCheck } from "./dependency-check.js";
import type { RunnerDeps } from "./types.js";

let tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs) {
    rmSync(tempDir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe("runDependencyCheck", () => {
  it("passes when all imports declared", async () => {
    const repoPath = createTempProject();
    writeProjectFile(repoPath, "package.json", JSON.stringify({ dependencies: { lodash: "^4.0.0" } }));
    writeProjectFile(repoPath, "src/index.js", "import _ from \"lodash\";\n");

    const result = await runDependencyCheck(createDeps(repoPath));

    expect(result.status).toBe("passed");
  });

  it("fails on undeclared import", async () => {
    const repoPath = createTempProject();
    writeProjectFile(repoPath, "package.json", JSON.stringify({ dependencies: {} }));
    writeProjectFile(repoPath, "src/index.ts", "import THREE from \"three\";\n");

    const result = await runDependencyCheck(createDeps(repoPath));

    expect(result.status).toBe("failed");
    expect(result.details).toContain("three");
  });

  it("ignores relative imports", async () => {
    const repoPath = createTempProject();
    writeProjectFile(repoPath, "package.json", JSON.stringify({ dependencies: {} }));
    writeProjectFile(repoPath, "src/foo.js", "import { bar } from \"./bar.js\";\n");

    const result = await runDependencyCheck(createDeps(repoPath));

    expect(result.status).toBe("passed");
  });

  it("ignores node: builtins", async () => {
    const repoPath = createTempProject();
    writeProjectFile(repoPath, "package.json", JSON.stringify({ dependencies: {} }));
    writeProjectFile(repoPath, "src/foo.js", "import { readFileSync } from \"node:fs\";\n");

    const result = await runDependencyCheck(createDeps(repoPath));

    expect(result.status).toBe("passed");
  });

  it("handles scoped packages", async () => {
    const repoPath = createTempProject();
    writeProjectFile(repoPath, "package.json", JSON.stringify({ dependencies: { "@vercel/analytics": "^1.0.0" } }));
    writeProjectFile(repoPath, "src/index.js", "import \"@vercel/analytics/react\";\n");

    const result = await runDependencyCheck(createDeps(repoPath));

    expect(result.status).toBe("passed");
  });

  it("unions deps across workspace package.jsons", async () => {
    const repoPath = createTempProject();
    writeProjectFile(repoPath, "package.json", JSON.stringify({ dependencies: {} }));
    writeProjectFile(repoPath, "client/package.json", JSON.stringify({ dependencies: { react: "^18" } }));
    writeProjectFile(repoPath, "src/index.jsx", "import React from \"react\";\n");

    const result = await runDependencyCheck(createDeps(repoPath));

    expect(result.status).toBe("passed");
  });

  it("handles dynamic import and require", async () => {
    const repoPath = createTempProject();
    writeProjectFile(repoPath, "package.json", JSON.stringify({ dependencies: {} }));
    writeProjectFile(
      repoPath,
      "src/index.js",
      "const x = await import(\"undcls\");\nconst y = require(\"undcls2\");\n",
    );

    const result = await runDependencyCheck(createDeps(repoPath));

    expect(result.status).toBe("failed");
    expect(result.details).toContain("undcls");
    expect(result.details).toContain("undcls2");
  });
});

function createTempProject(): string {
  const tempDir = mkdtempSync(join(tmpdir(), "oc-deps-test-"));
  tempDirs.push(tempDir);
  return tempDir;
}

function writeProjectFile(repoPath: string, filePath: string, contents: string): void {
  const fullPath = join(repoPath, filePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents);
}

function createDeps(repoPath: string): RunnerDeps {
  return {
    repoPath,
    shell: {
      db: createDb(join(repoPath, "test.sqlite")),
      projectId: "dependency-check-test",
      repoPath,
      logsPath: repoPath,
      createGate: (_projectId, gateType) => ({
        id: "dependency-check-gate",
        projectId: "dependency-check-test",
        gateType,
      }),
      waitForGate: async () => "approve",
      runLocal: async () => ({
        exitCode: 0,
        stdout: "",
        stderr: "",
      }),
      runSandbox: async () => ({
        exitCode: 0,
        stdout: "",
        stderr: "",
      }),
    },
  };
}
