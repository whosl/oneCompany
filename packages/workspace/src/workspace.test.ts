import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createWorkspace, listFiles, readFile, writeFile } from "./workspace.js";
import { PathEscapeError } from "./types.js";

describe("workspace layout — M5", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function tempRoot(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oc-ws-"));
    tmpDirs.push(dir);
    return dir;
  }

  it("creates repo, artifacts, logs, and meta.json", () => {
    const rootDir = tempRoot();
    const workspace = createWorkspace({
      projectId: "proj-1",
      slug: "demo",
      rootDir: path.join(rootDir, "demo"),
    });

    expect(fs.existsSync(workspace.repo)).toBe(true);
    expect(fs.existsSync(workspace.artifacts)).toBe(true);
    expect(fs.existsSync(workspace.logs)).toBe(true);

    const meta = JSON.parse(fs.readFileSync(path.join(workspace.root, "meta.json"), "utf8")) as {
      projectId: string;
      slug: string;
      version: number;
    };
    expect(meta.projectId).toBe("proj-1");
    expect(meta.slug).toBe("demo");
    expect(meta.version).toBe(1);
  });

  it("writes and reads files scoped to repo", () => {
    const rootDir = tempRoot();
    const workspace = createWorkspace({
      projectId: "proj-2",
      slug: "files",
      rootDir: path.join(rootDir, "files"),
    });

    writeFile(workspace.repo, "src/hello.ts", "export const x = 1;\n");
    expect(readFile(workspace.repo, "src/hello.ts")).toContain("export const x = 1");
    expect(listFiles(workspace.repo)).toEqual(["src/hello.ts"]);
  });

  it("rejects writes that escape the repo", () => {
    const rootDir = tempRoot();
    const workspace = createWorkspace({
      projectId: "proj-3",
      slug: "escape",
      rootDir: path.join(rootDir, "escape"),
    });

    expect(() => writeFile(workspace.repo, "../escape.txt", "bad")).toThrow(PathEscapeError);
  });
});
