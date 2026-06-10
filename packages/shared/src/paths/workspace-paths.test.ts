import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveScopedPath } from "./workspace-paths.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("workspace path guard — M13 F-10", () => {
  it("rejects symlink escapes", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "oc-repo-"));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "oc-outside-"));
    tempDirs.push(repo, outside);

    fs.writeFileSync(path.join(outside, "secret.txt"), "nope");
    fs.symlinkSync(outside, path.join(repo, "escape-link"));

    expect(() => resolveScopedPath(repo, "escape-link/secret.txt")).toThrow(/Symlink escapes root/);
  });
});
