import fs from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { commits } from "@oc/shared";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { commitSlice, initRepo } from "./git.js";
import { seedProject, setupTestDb } from "./test-utils.js";
import { writeFile } from "./workspace.js";

describe("git service — M5", () => {
  it("initializes a git repository", () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), "oc-git-"));
    initRepo(repoPath);
    expect(fs.existsSync(path.join(repoPath, ".git"))).toBe(true);
    fs.rmSync(repoPath, { recursive: true, force: true });
  });

  it("commitSlice creates a git commit and commits row", () => {
    const { db, cleanup } = setupTestDb();
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), "oc-git-"));
    const projectId = seedProject(db);
    const taskId = "slice-1";

    initRepo(repoPath);
    writeFile(repoPath, "README.md", "# demo\n");

    const result = commitSlice({
      projectId,
      taskId,
      summary: "add readme",
      tests: ["readme.spec.ts"],
      db,
      repoPath,
    });

    expect(result.hash).toMatch(/^[0-9a-f]{40}$/);

    const [row] = db.select().from(commits).where(eq(commits.project_id, projectId)).all();
    expect(row?.task_id).toBe(taskId);
    expect(row?.hash).toBe(result.hash);
    expect(row?.summary).toBe("add readme");

    fs.rmSync(repoPath, { recursive: true, force: true });
    cleanup();
  });

  it("blocks generated artifacts from slice commits", () => {
    const { db, cleanup } = setupTestDb();
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), "oc-git-hygiene-"));
    const projectId = seedProject(db);

    initRepo(repoPath);
    writeFile(repoPath, "src/App.tsx", "export default function App() { return null; }\n");
    writeFile(repoPath, "node_modules/pkg/index.js", "module.exports = {};\n");
    execFileSync("git", ["add", "-f", "node_modules/pkg/index.js"], { cwd: repoPath });

    expect(() =>
      commitSlice({
        projectId,
        taskId: "slice-1",
        summary: "add app",
        db,
        repoPath,
      }),
    ).toThrow(/Repository hygiene gate failed/);
    expect(db.select().from(commits).where(eq(commits.project_id, projectId)).all()).toHaveLength(0);

    fs.rmSync(repoPath, { recursive: true, force: true });
    cleanup();
  });
});
