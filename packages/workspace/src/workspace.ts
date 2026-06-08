import fs from "node:fs";
import path from "node:path";
import { assertInsideRepo, resolveScopedPath } from "./paths.js";
import type { WorkspaceMeta, WorkspacePaths } from "./types.js";

export function getGeneratedProjectsRoot(): string {
  return path.join(process.cwd(), "generated-projects");
}

export function createWorkspace(input: {
  projectId: string;
  slug: string;
  rootDir?: string;
}): WorkspacePaths {
  const root = input.rootDir ?? path.join(getGeneratedProjectsRoot(), input.slug);
  const repo = path.join(root, "repo");
  const artifacts = path.join(root, "artifacts");
  const logs = path.join(root, "logs");

  for (const dir of [root, repo, artifacts, logs]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const meta: WorkspaceMeta = {
    version: 1,
    projectId: input.projectId,
    slug: input.slug,
    createdAt: new Date().toISOString(),
    paths: { root, repo, artifacts, logs },
  };

  fs.writeFileSync(path.join(root, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`, "utf8");

  return { root, repo, artifacts, logs, meta };
}

export function writeFile(repoRoot: string, relativePath: string, content: string): void {
  const target = resolveScopedPath(repoRoot, relativePath);
  assertInsideRepo(repoRoot, target);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
}

export function readFile(repoRoot: string, relativePath: string): string {
  const target = resolveScopedPath(repoRoot, relativePath);
  assertInsideRepo(repoRoot, target);
  return fs.readFileSync(target, "utf8");
}

export function listFiles(repoRoot: string, relativeDir = "."): string[] {
  const targetDir = resolveScopedPath(repoRoot, relativeDir);
  assertInsideRepo(repoRoot, targetDir);
  if (!fs.existsSync(targetDir)) {
    return [];
  }

  const entries = fs.readdirSync(targetDir, { withFileTypes: true });
  return entries
    .flatMap((entry) => {
      const childRelative =
        relativeDir === "." ? entry.name : `${relativeDir.replace(/\\/g, "/")}/${entry.name}`;
      if (entry.isDirectory()) {
        return listFiles(repoRoot, childRelative);
      }
      return [childRelative];
    })
    .sort();
}
