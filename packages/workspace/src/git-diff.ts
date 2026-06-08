import { execFileSync } from "node:child_process";

export function getGitPatch(repoPath: string, diffIndex = 0): string {
  try {
    const hashes = execFileSync("git", ["rev-list", "--reverse", "HEAD"], {
      cwd: repoPath,
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .filter(Boolean);

    if (hashes.length === 0) {
      return "No commits in repository.";
    }

    const index = Math.min(Math.max(diffIndex, 0), hashes.length - 1);
    const hash = hashes[index];
    if (!hash) {
      return "No commit found for diff.";
    }

    return execFileSync("git", ["show", hash, "--stat", "-p"], {
      cwd: repoPath,
      encoding: "utf8",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Unable to load git patch: ${message}`;
  }
}
