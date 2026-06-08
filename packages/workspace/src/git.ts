import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { commits, type Db } from "@oc/shared";

function runGit(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

export function initRepo(repoPath: string): void {
  fs.mkdirSync(repoPath, { recursive: true });
  if (!fs.existsSync(path.join(repoPath, ".git"))) {
    runGit(repoPath, ["init"]);
    runGit(repoPath, ["config", "user.email", "onecompany@local.dev"]);
    runGit(repoPath, ["config", "user.name", "OneCompany"]);
  }
}

export type CommitSliceInput = {
  projectId: string;
  taskId: string;
  summary: string;
  tests?: string[];
  db: Db;
  repoPath: string;
};

export function commitSlice(input: CommitSliceInput): { hash: string; commitId: string } {
  initRepo(input.repoPath);
  runGit(input.repoPath, ["add", "-A"]);
  const message = `slice(${input.taskId}): ${input.summary}`;
  const body = input.tests?.length ? `\n\nTests: ${JSON.stringify(input.tests)}` : "";
  runGit(input.repoPath, ["commit", "-m", message + body]);

  const hash = runGit(input.repoPath, ["rev-parse", "HEAD"]);
  const commitId = randomUUID();
  const now = new Date().toISOString();

  input.db
    .insert(commits)
    .values({
      id: commitId,
      project_id: input.projectId,
      hash,
      task_id: input.taskId,
      summary: input.summary,
      created_at: now,
    })
    .run();

  return { hash, commitId };
}
