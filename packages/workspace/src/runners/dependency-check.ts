import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import type { NormalizedRunnerResult } from "@oc/shared";
import type { RunnerDeps, SuiteSpec } from "./types.js";

const SKIPPED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  "test-results",
  "playwright-report",
  ".turbo",
  ".cache",
]);

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".cjs",
  ".vue",
  ".svelte",
  ".astro",
]);

const NODE_BUILTINS = new Set([
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "domain",
  "events",
  "fs",
  "fs/promises",
  "http",
  "http2",
  "https",
  "inspector",
  "module",
  "net",
  "os",
  "path",
  "path/posix",
  "path/win32",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "readline/promises",
  "repl",
  "stream",
  "stream/consumers",
  "stream/promises",
  "stream/web",
  "string_decoder",
  "timers",
  "timers/promises",
  "tls",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "worker_threads",
  "zlib",
]);

const IMPORT_PATTERNS = [
  // import/export ... from "pkg" — must be on a single line
  /\b(?:import|export)\b[^'\n;]*?\bfrom\s*['"`]([^'`\n]+)['"`]/g,
  // side-effect import: import "pkg"
  /\bimport\s+['"`]([^'`\n]+)['"`]/g,
  // dynamic import: import("pkg")
  /\bimport\s*\(\s*['"`]([^'`\n]+)['"`]\s*\)/g,
  // CommonJS require: require("pkg")
  /\brequire\s*\(\s*['"`]([^'`\n]+)['"`]\s*\)/g,
];

type UndeclaredImport = {
  packageName: string;
  file: string;
  line: number;
};

export async function runDependencyCheck(
  deps: RunnerDeps,
  spec: SuiteSpec = { suite: "final:deps", command: "noop" },
): Promise<NormalizedRunnerResult> {
  const packageJsonFiles: string[] = [];
  const sourceFiles: string[] = [];
  walkProject(deps.repoPath, packageJsonFiles, sourceFiles);

  if (packageJsonFiles.length === 0) {
    return {
      suite: spec.suite,
      status: "passed",
      details: "deps: all imports declared",
    };
  }

  const declared = collectDeclaredDependencies(packageJsonFiles);
  const undeclared = collectUndeclaredImports(deps.repoPath, sourceFiles, declared);

  if (undeclared.length > 0) {
    const listed = undeclared
      .slice(0, 10)
      .map((entry) => `${entry.packageName} at ${entry.file}:${entry.line}`);
    const remaining = undeclared.length - listed.length;
    const suffix = remaining > 0 ? `; ...and ${remaining} more` : "";

    return {
      suite: spec.suite,
      status: "failed",
      failedCount: undeclared.length,
      details: `deps: ${undeclared.length} undeclared import(s): ${listed.join("; ")}${suffix}`,
    };
  }

  return {
    suite: spec.suite,
    status: "passed",
    details: "deps: all imports declared",
  };
}

function walkProject(
  dir: string,
  packageJsonFiles: string[],
  sourceFiles: string[],
): void {
  if (!existsSync(dir)) {
    return;
  }

  for (const entry of readdirSync(dir)) {
    if (SKIPPED_DIRS.has(entry)) {
      continue;
    }

    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      walkProject(fullPath, packageJsonFiles, sourceFiles);
      continue;
    }

    if (!stats.isFile()) {
      continue;
    }

    if (entry === "package.json") {
      packageJsonFiles.push(fullPath);
      continue;
    }

    if (isSourceFile(entry)) {
      sourceFiles.push(fullPath);
    }
  }
}

function collectDeclaredDependencies(packageJsonFiles: string[]): Set<string> {
  const declared = new Set<string>();
  for (const packageJsonFile of packageJsonFiles) {
    const parsed = JSON.parse(readFileSync(packageJsonFile, "utf8")) as unknown;
    if (!isRecord(parsed)) {
      continue;
    }

    addDependencyKeys(declared, parsed.dependencies);
    addDependencyKeys(declared, parsed.devDependencies);
    addDependencyKeys(declared, parsed.peerDependencies);
    addDependencyKeys(declared, parsed.optionalDependencies);
  }
  return declared;
}

function addDependencyKeys(declared: Set<string>, value: unknown): void {
  if (!isRecord(value)) {
    return;
  }

  for (const packageName of Object.keys(value)) {
    declared.add(packageName);
  }
}

function collectUndeclaredImports(
  repoPath: string,
  sourceFiles: string[],
  declared: Set<string>,
): UndeclaredImport[] {
  const undeclared: UndeclaredImport[] = [];
  const seen = new Set<string>();

  for (const sourceFile of sourceFiles) {
    const source = readFileSync(sourceFile, "utf8");
    const relativeFile = toPosixPath(relative(repoPath, sourceFile));

    for (const specifier of extractSpecifiers(source)) {
      const packageName = normalizePackageName(specifier);
      if (packageName === undefined) {
        continue;
      }

      if (declared.has(packageName) || NODE_BUILTINS.has(packageName)) {
        continue;
      }

      const line = lineNumberForIndex(source, specifier.index);
      const dedupeKey = `${packageName}\0${relativeFile}\0${line}`;
      if (seen.has(dedupeKey)) {
        continue;
      }

      seen.add(dedupeKey);
      undeclared.push({ packageName, file: relativeFile, line });
    }
  }

  return undeclared;
}

function extractSpecifiers(source: string): Array<{ value: string; index: number }> {
  const specifiers: Array<{ value: string; index: number }> = [];
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(source);
    while (match !== null) {
      const value = match[1];
      if (value !== undefined) {
        specifiers.push({ value, index: match.index });
      }
      match = pattern.exec(source);
    }
  }
  return specifiers;
}

function normalizePackageName(specifier: { value: string }): string | undefined {
  const value = specifier.value.trim();
  if (
    value.length === 0 ||
    value.startsWith(".") ||
    value.startsWith("/") ||
    value.startsWith("\\") ||
    value.startsWith("node:") ||
    value.startsWith("#")
  ) {
    return undefined;
  }

  if (value.startsWith("@")) {
    const [scope, name] = value.split("/");
    return scope !== undefined && name !== undefined ? `${scope}/${name}` : value;
  }

  const [packageName] = value.split("/");
  return packageName;
}

function lineNumberForIndex(source: string, index: number): number {
  let line = 1;
  for (let position = 0; position < index; position += 1) {
    if (source[position] === "\n") {
      line += 1;
    }
  }
  return line;
}

function isSourceFile(fileName: string): boolean {
  return SOURCE_EXTENSIONS.has(extname(fileName)) && !/\.d\.[cm]?ts$/.test(fileName);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toPosixPath(path: string): string {
  return path.split(sep).join("/");
}
