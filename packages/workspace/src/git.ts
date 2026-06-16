import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { commits, type Db } from "@oc/shared";

function runGit(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

const GENERATED_REPO_GITIGNORE_ENTRIES = [
  "node_modules/",
  "dist/",
  "test-results/",
  "playwright-report/",
  "playwright-report.json",
  "coverage/",
];

function normalizeGitPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function isGeneratedArtifactPath(value: string): boolean {
  const filePath = normalizeGitPath(value);
  return (
    filePath === "playwright-report.json" ||
    filePath.startsWith("node_modules/") ||
    filePath.startsWith("dist/") ||
    filePath.startsWith("test-results/") ||
    filePath.startsWith("playwright-report/") ||
    filePath.startsWith("coverage/")
  );
}

function ensureGeneratedRepoGitignore(repoPath: string): void {
  const gitignorePath = path.join(repoPath, ".gitignore");
  const current = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, "utf8")
    : "";
  const lines = new Set(current.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  const missing = GENERATED_REPO_GITIGNORE_ENTRIES.filter((entry) => !lines.has(entry));
  if (missing.length === 0) {
    return;
  }
  const prefix = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  fs.writeFileSync(gitignorePath, `${current}${prefix}${missing.join("\n")}\n`);
}

export function assertGeneratedRepoHygiene(repoPath: string): void {
  const staged = runGit(repoPath, ["diff", "--cached", "--name-only"])
    .split("\n")
    .map((filePath) => filePath.trim())
    .filter(Boolean);
  const blocked = staged.filter(isGeneratedArtifactPath);
  if (blocked.length === 0) {
    return;
  }
  runGit(repoPath, ["reset"]);
  throw new Error(
    [
      "Repository hygiene gate failed: generated artifacts must not be committed.",
      `Blocked paths: ${blocked.slice(0, 12).join(", ")}${blocked.length > 12 ? `, ... +${blocked.length - 12} more` : ""}`,
      "Remove generated artifacts or keep them ignored, then rerun the slice.",
    ].join(" "),
  );
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
  ensureGeneratedRepoGitignore(input.repoPath);
  runGit(input.repoPath, ["add", "-A"]);
  assertGeneratedRepoHygiene(input.repoPath);
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
