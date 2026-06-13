import { execFileSync, spawnSync } from "node:child_process";

/** True when the codegraph CLI resolves on PATH. */
export function isCodegraphAvailable(): boolean {
  try {
    execFileSync("command", ["-v", "codegraph"], { stdio: "ignore", shell: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Initialize a codegraph index for a repo directory. Safe on empty repos
 * (codegraph prints "No files found to index" and exits 0). Throws on
 * non-zero exit so the caller can decide to swallow or surface it.
 */
export function initCodegraphForRepo(repoPath: string): void {
  const result = spawnSync("codegraph", ["init", repoPath], {
    stdio: "pipe",
    timeout: 30_000,
  });
  if (result.status !== 0) {
    const stderr = result.stderr?.toString().trim() ?? `exit ${result.status}`;
    throw new Error(`codegraph init failed for ${repoPath}: ${stderr}`);
  }
}
