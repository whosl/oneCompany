import fs from "node:fs";
import path from "node:path";
import { initRepo } from "./git.js";

export function findVitestMjs(startDir: string): string | undefined {
  let dir = path.resolve(startDir);
  for (let depth = 0; depth < 10; depth += 1) {
    const candidate = path.join(dir, "node_modules", "vitest", "vitest.mjs");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return undefined;
}

/** Run slice tests in the generated repo cwd using the workspace vitest binary (no local install). */
export function resolveSliceTestCommand(repoPath: string, command: string): string {
  const trimmed = command.trim();
  const vitestMjs = findVitestMjs(repoPath);
  if (!vitestMjs) {
    return trimmed;
  }

  const pnpmMatch = trimmed.match(/^pnpm\s+(?:exec\s+)?vitest\s+(.+)$/i);
  if (pnpmMatch) {
    return `node "${vitestMjs}" ${pnpmMatch[1]}`;
  }

  const npxMatch = trimmed.match(/^npx\s+vitest\s+(.+)$/i);
  if (npxMatch) {
    return `node "${vitestMjs}" ${npxMatch[1]}`;
  }

  const directMatch = trimmed.match(/^vitest\s+(.+)$/i);
  if (directMatch) {
    return `node "${vitestMjs}" ${directMatch[1]}`;
  }

  return trimmed;
}

export function ensureDevRepoScaffold(repoPath: string): void {
  initRepo(repoPath);
  const pkgPath = path.join(repoPath, "package.json");
  if (fs.existsSync(pkgPath)) {
    return;
  }

  fs.mkdirSync(path.join(repoPath, "src"), { recursive: true });

  fs.writeFileSync(
    pkgPath,
    `${JSON.stringify(
      {
        name: "generated-app",
        version: "0.0.0",
        private: true,
        type: "module",
        bin: { app: "./dist/index.js" },
        scripts: {
          build: "tsc",
          test: "vitest run",
        },
      },
      null,
      2,
    )}\n`,
  );

  fs.writeFileSync(
    path.join(repoPath, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          outDir: "dist",
          rootDir: "src",
          esModuleInterop: true,
          skipLibCheck: true,
        },
        include: ["src"],
      },
      null,
      2,
    )}\n`,
  );

  fs.writeFileSync(
    path.join(repoPath, "vitest.config.ts"),
    `import { defineConfig } from "vitest/config";\n\nexport default defineConfig({\n  test: { environment: "node" },\n});\n`,
  );
}
