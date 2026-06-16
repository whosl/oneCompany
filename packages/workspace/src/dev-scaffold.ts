import fs from "node:fs";
import path from "node:path";
import { initRepo } from "./git.js";
import { SCAFFOLD_PLACEHOLDER_TITLE } from "./web-layer.js";

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

/**
 * 将 Planner 可能产出的 pytest/python 命令规范化为 vitest（TS scaffold 唯一权威测试栈）。
 * 编码 Agent 提示词、Opencode 会话、平台权威测试三处共用，避免「Agent 跑 pytest、平台验 vitest」分裂。
 */
export function normalizeSliceTestCommand(
  repoPath: string,
  command: string,
  sliceId?: string,
): string {
  const trimmed = command.trim();
  const hasVitestScaffold = fs.existsSync(path.join(repoPath, "vitest.config.ts"));
  if (!hasVitestScaffold || !/\b(pytest|python\d?|pip\d?)\b/i.test(trimmed)) {
    return resolveSliceTestCommand(repoPath, trimmed);
  }

  const pyPathMatch = trimmed.match(/tests\/[\w./-]+\.py/i);
  if (pyPathMatch) {
    const relPy = pyPathMatch[0];
    const relTs = relPy.replace(/\.py$/i, ".test.ts");
    if (fs.existsSync(path.join(repoPath, relTs))) {
      return resolveSliceTestCommand(
        repoPath,
        `pnpm vitest run ${relTs} --reporter=json`,
      );
    }
  }

  if (sliceId) {
    const testsDir = path.join(repoPath, "tests");
    if (fs.existsSync(testsDir)) {
      const needle = sliceId.replace(/^slice-/, "slice");
      const tsFile = fs
        .readdirSync(testsDir)
        .find((name) => name.includes(needle) && name.endsWith(".test.ts"));
      if (tsFile) {
        return resolveSliceTestCommand(
          repoPath,
          `pnpm vitest run tests/${tsFile} --reporter=json`,
        );
      }
    }
  }

  return resolveSliceTestCommand(repoPath, "pnpm vitest run --reporter=json");
}

function findTscJs(startDir: string): string | undefined {
  let dir = path.resolve(startDir);
  for (let depth = 0; depth < 10; depth += 1) {
    const candidate = path.join(dir, "node_modules", "typescript", "lib", "tsc.js");
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

/**
 * Typecheck command for a generated repo using the workspace TypeScript
 * (generated repos have no node_modules of their own). Returns undefined when
 * the repo has no tsconfig or no tsc is reachable — callers should skip.
 */
export function resolveTypecheckCommand(repoPath: string): string | undefined {
  if (!fs.existsSync(path.join(repoPath, "tsconfig.json"))) {
    return undefined;
  }
  const tscJs = findTscJs(repoPath);
  if (!tscJs) {
    return undefined;
  }
  return `node "${tscJs}" --noEmit -p tsconfig.json`;
}

export function findPlaywrightCli(startDir: string): string | undefined {
  let dir = path.resolve(startDir);
  for (let depth = 0; depth < 12; depth += 1) {
    const hoisted = path.join(dir, "node_modules", "@playwright", "test", "cli.js");
    if (fs.existsSync(hoisted)) {
      return hoisted;
    }

    const pnpmDir = path.join(dir, "node_modules", ".pnpm");
    if (fs.existsSync(pnpmDir)) {
      for (const entry of fs.readdirSync(pnpmDir)) {
        if (!entry.startsWith("@playwright+test@")) {
          continue;
        }
        const candidate = path.join(
          pnpmDir,
          entry,
          "node_modules",
          "@playwright",
          "test",
          "cli.js",
        );
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return undefined;
}

/** …/node_modules containing @playwright/test (pnpm nested or hoisted). */
function findPlaywrightModulesDir(startDir: string): string | undefined {
  const cli = findPlaywrightCli(startDir);
  if (!cli) {
    return undefined;
  }
  const modulesDir = path.dirname(path.dirname(path.dirname(cli)));
  return path.basename(modulesDir) === "node_modules" ? modulesDir : undefined;
}

/** node_modules roots that resolve @playwright/test for generated repos without a local install. */
export function findPlaywrightModulePaths(startDir: string): string[] {
  const modulesDir = findPlaywrightModulesDir(startDir);
  if (!modulesDir) {
    return [];
  }
  const paths = [modulesDir];
  const workspaceModules = path.join(path.dirname(modulesDir), "node_modules");
  if (
    fs.existsSync(workspaceModules) &&
    fs.existsSync(path.join(workspaceModules, "@playwright", "test"))
  ) {
    paths.push(workspaceModules);
  }
  return paths;
}

/** Run Playwright in the generated repo cwd using the workspace CLI (no local install). */
export function resolvePlaywrightCommand(
  repoPath: string,
  command = "pnpm exec playwright test --reporter=json",
): string {
  const trimmed = command.trim();
  const cli = findPlaywrightCli(repoPath);
  if (!cli) {
    return trimmed;
  }

  const pnpmMatch = trimmed.match(/^pnpm\s+(?:exec\s+)?playwright\s+test(.*)$/i);
  if (pnpmMatch) {
    return `node "${cli}" test${pnpmMatch[1] ?? ""}`.trim();
  }

  const npxMatch = trimmed.match(/^npx\s+playwright\s+test(.*)$/i);
  if (npxMatch) {
    return `node "${cli}" test${npxMatch[1] ?? ""}`.trim();
  }

  return trimmed;
}

const PLAYWRIGHT_CONFIG = `/** @type {import('@playwright/test').PlaywrightTestConfig} */
export default {
  testDir: "./e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
};
`;

const E2E_SMOKE_SPEC = `import { test, expect } from "@playwright/test";

test("app shell loads with product UI (not scaffold placeholder)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("app-shell")).toBeVisible();
  await expect(page.getByTestId("app-title")).toBeVisible();
  await expect(page.getByTestId("app-title")).not.toHaveText("${SCAFFOLD_PLACEHOLDER_TITLE}");
  await expect(page.getByTestId("app-page")).toBeVisible();
});
`;

const DEV_SERVER_SCRIPT = `import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const host = process.env.PREVIEW_HOST || process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || process.env.PREVIEW_PORT || 3000);
const root = process.env.PREVIEW_ROOT || process.cwd();
const basePath = normalizeBasePath(process.env.PREVIEW_BASE_PATH || "/");

// Module scripts require a JavaScript MIME type; missing Content-Type breaks ESM in browsers.
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

const server = http.createServer((req, res) => {
  const rawPath = String(req.url || "/").split("?")[0];
  const urlPath = stripBasePath(rawPath, basePath);
  if (urlPath === null) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\\//, "");
  const filePath = path.join(root, rel);

  if (filePath.startsWith(root) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const type = MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(fs.readFileSync(filePath));
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

server.listen(port, host);

function normalizeBasePath(value) {
  if (!value || value === "/") return "/";
  const withLeading = value.startsWith("/") ? value : "/" + value;
  return withLeading.replace(/\\/$/, "");
}

function stripBasePath(urlPath, basePath) {
  if (basePath === "/") return urlPath;
  if (urlPath === basePath) return "/";
  if (urlPath.startsWith(basePath + "/")) return urlPath.slice(basePath.length) || "/";
  return null;
}
`;

const INDEX_HTML = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>${SCAFFOLD_PLACEHOLDER_TITLE}</title>
  </head>
  <body data-testid="app-shell">
    <h1 data-testid="app-title">${SCAFFOLD_PLACEHOLDER_TITLE}</h1>
    <p data-testid="scaffold-notice">Coding Agent 须替换此占位页为产品 UI。</p>
  </body>
</html>
`;

function ensureWebDevScript(repoPath: string): void {
  const scriptsDir = path.join(repoPath, "scripts");
  fs.mkdirSync(scriptsDir, { recursive: true });
  const devServerPath = path.join(scriptsDir, "dev-server.mjs");
  if (!fs.existsSync(devServerPath)) {
    fs.writeFileSync(devServerPath, DEV_SERVER_SCRIPT);
  }

  const pkgPath = path.join(repoPath, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return;
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const scripts = { ...pkg.scripts };
  if (!scripts.dev) {
    scripts.dev = "node scripts/dev-server.mjs";
  }
  if (!scripts.preview) {
    scripts.preview = "node scripts/dev-server.mjs";
  }
  const next = { ...pkg, scripts };
  fs.writeFileSync(pkgPath, `${JSON.stringify(next, null, 2)}\n`);
}

/** Symlink workspace Playwright packages so generated repos can import @playwright/test. */
function linkPlaywrightPackages(repoPath: string): void {
  const workspaceModules = findPlaywrightModulesDir(repoPath);
  if (!workspaceModules) {
    return;
  }
  const nm = path.join(repoPath, "node_modules");
  fs.mkdirSync(path.join(nm, "@playwright"), { recursive: true });

  const links: Array<[string, string]> = [
    [path.join(nm, "@playwright", "test"), path.join(workspaceModules, "@playwright", "test")],
    [path.join(nm, "playwright"), path.join(workspaceModules, "playwright")],
  ];

  for (const [linkPath, target] of links) {
    if (fs.existsSync(linkPath)) {
      continue;
    }
    if (!fs.existsSync(target)) {
      continue;
    }
    try {
      fs.symlinkSync(target, linkPath, "dir");
    } catch {
      // Best-effort; NODE_PATH fallback may still work on some setups.
    }
  }
}

/** Add Playwright E2E scaffold to a generated repo (idempotent). */
export function ensureE2eScaffold(repoPath: string): void {
  fs.mkdirSync(path.join(repoPath, "e2e"), { recursive: true });
  linkPlaywrightPackages(repoPath);

  const pwConfig = path.join(repoPath, "playwright.config.mjs");
  if (!fs.existsSync(pwConfig) && !fs.existsSync(path.join(repoPath, "playwright.config.ts"))) {
    fs.writeFileSync(pwConfig, PLAYWRIGHT_CONFIG);
  }

  const smokeSpec = path.join(repoPath, "e2e", "smoke.spec.ts");
  if (!fs.existsSync(smokeSpec)) {
    fs.writeFileSync(smokeSpec, E2E_SMOKE_SPEC);
  }

  const indexHtml = path.join(repoPath, "index.html");
  if (!fs.existsSync(indexHtml)) {
    fs.writeFileSync(indexHtml, INDEX_HTML);
  }

  ensureWebDevScript(repoPath);
}

export const GENERATED_APP_DEV_DEPS = {
  typescript: "^5.7.3",
  vitest: "^3.0.4",
  "@playwright/test": "1.55.1",
  "@types/node": "^22.10.7",
} as const;

/** Ensure a generated repo can `install && typecheck && test && build` standalone. */
export function ensurePackageRunnable(repoPath: string): void {
  const pkgPath = path.join(repoPath, "package.json");
  if (!fs.existsSync(pkgPath)) return;

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
    scripts?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const devDeps = { ...GENERATED_APP_DEV_DEPS, ...pkg.devDependencies };
  const scripts: Record<string, string> = {
    dev: "node scripts/dev-server.mjs",
    preview: "node scripts/dev-server.mjs",
    build: "tsc",
    test: "vitest run",
    typecheck: "tsc --noEmit",
    verify: "npm run typecheck && npm test && npm run build",
    ...pkg.scripts,
  };

  const next = { ...pkg, scripts, devDependencies: devDeps };
  const serialized = `${JSON.stringify(next, null, 2)}\n`;
  if (fs.readFileSync(pkgPath, "utf8") !== serialized) {
    fs.writeFileSync(pkgPath, serialized);
  }
}

export function ensureDevRepoScaffold(repoPath: string): void {
  initRepo(repoPath);

  // Generated repos may live inside the OneCompany monorepo tree. Without an
  // own workspace boundary, `pnpm <cmd>` inside the repo walks up to the host
  // pnpm-workspace and can trigger `turbo run test` on the entire monorepo
  // (rebuilding dists → restarting the dev API → killing the workflow).
  const workspaceBoundary = path.join(repoPath, "pnpm-workspace.yaml");
  if (!fs.existsSync(workspaceBoundary)) {
    fs.writeFileSync(workspaceBoundary, "packages: []\n");
  }

  const pkgPath = path.join(repoPath, "package.json");
  if (fs.existsSync(pkgPath)) {
    ensurePackageRunnable(repoPath);
    ensureE2eScaffold(repoPath);
    ensureWebDevScript(repoPath);
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
          dev: "node scripts/dev-server.mjs",
          preview: "node scripts/dev-server.mjs",
          build: "tsc",
          test: "vitest run",
          typecheck: "tsc --noEmit",
          verify: "pnpm typecheck && pnpm test && pnpm build",
        },
        devDependencies: {
          typescript: "^5.7.3",
          vitest: "^3.0.4",
          "@playwright/test": "1.55.1",
          "@types/node": "^22.10.7",
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
          types: ["node"],
        },
        include: ["src", "tests"],
      },
      null,
      2,
    )}\n`,
  );

  fs.writeFileSync(
    path.join(repoPath, "RUN.md"),
    [
      "# Run Instructions",
      "",
      "## Local verification",
      "",
      "```bash",
      "pnpm install",
      "pnpm verify",
      "```",
      "",
      "## Browser preview",
      "",
      "```bash",
      "pnpm dev",
      "# open http://127.0.0.1:3000 (or the PORT shown in the terminal)",
      "```",
      "",
      "Individual steps:",
      "",
      "```bash",
      "pnpm typecheck",
      "pnpm test",
      "pnpm build",
      "```",
      "",
      "## Docker",
      "",
      "```bash",
      "docker compose up --build",
      "```",
      "",
      "If the generated app references third-party API keys, provide them through a local",
      "`.env` file. Missing keys should use mock data until real credentials are supplied.",
    ].join("\n"),
  );

  fs.writeFileSync(
    path.join(repoPath, "vitest.config.ts"),
    `import { defineConfig } from "vitest/config";\n\nexport default defineConfig({\n  test: {\n    environment: "node",\n    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],\n  },\n});\n`,
  );

  ensureE2eScaffold(repoPath);
  ensureWebDevScript(repoPath);
}
