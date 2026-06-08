import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertInsideRepo, resolveScopedPath } from "./paths.js";
import { PathEscapeError } from "./types.js";

describe("path containment — M5", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function makeRepo(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oc-repo-"));
    tmpDirs.push(dir);
    return dir;
  }

  it("resolves safe relative paths inside the repo", () => {
    const repo = makeRepo();
    const resolved = resolveScopedPath(repo, "src/index.ts");
    expect(resolved).toBe(path.join(repo, "src/index.ts"));
  });

  it("rejects parent traversal", () => {
    const repo = makeRepo();
    expect(() => resolveScopedPath(repo, "../escape.txt")).toThrow(PathEscapeError);
  });

  it("rejects absolute paths", () => {
    const repo = makeRepo();
    expect(() => resolveScopedPath(repo, "/etc/passwd")).toThrow(PathEscapeError);
  });

  it("rejects symlink escapes on read", () => {
    const repo = makeRepo();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "oc-out-"));
    tmpDirs.push(outside);
    fs.writeFileSync(path.join(outside, "secret.txt"), "nope", "utf8");

    const linkPath = path.join(repo, "link.txt");
    fs.symlinkSync(path.join(outside, "secret.txt"), linkPath);

    expect(() => assertInsideRepo(repo, linkPath)).toThrow(PathEscapeError);
  });
});
