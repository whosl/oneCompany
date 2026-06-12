import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveApiUrl } from "../shared/config.js";
import { checkSidecarHealth } from "../shared/sidecar.js";

export async function daemon(): Promise<void> {
  const apiUrl = resolveApiUrl();
  const existing = await checkSidecarHealth(apiUrl);
  if (existing.ok) {
    console.log(`OneCompany sidecar already running at ${apiUrl}`);
    return;
  }

  const monorepoRoot = findMonorepoRoot(path.dirname(fileURLToPath(import.meta.url)));
  if (!monorepoRoot) {
    throw new Error(
      "Could not find OneCompany monorepo root. Run from the repo or set ONECOMPANY_API_URL to an existing API.",
    );
  }

  console.log(`Starting OneCompany API from ${monorepoRoot} …`);
  const child = spawn("pnpm", ["--filter", "@oc/api", "dev"], {
    cwd: monorepoRoot,
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

function findMonorepoRoot(start: string): string | undefined {
  let dir = start;
  for (let i = 0; i < 8; i += 1) {
    const pkg = path.join(dir, "package.json");
    const pnpm = path.join(dir, "pnpm-workspace.yaml");
    if (fs.existsSync(pkg) && fs.existsSync(pnpm)) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}
