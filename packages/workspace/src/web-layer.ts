import fs from "node:fs";
import path from "node:path";

/** Title shown by the platform scaffold before Coding Agent replaces it. */
export const SCAFFOLD_PLACEHOLDER_TITLE = "generated-app";

type PackageJson = {
  scripts?: Record<string, string>;
};

function readPackageJson(repoPath: string): PackageJson | null {
  const pkgPath = path.join(repoPath, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(pkgPath, "utf8")) as PackageJson;
  } catch {
    return null;
  }
}

export function readPrimaryIndexHtml(repoPath: string): string | undefined {
  for (const rel of ["index.html", "public/index.html", "src/index.html"]) {
    const filePath = path.join(repoPath, rel);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return fs.readFileSync(filePath, "utf8");
    }
  }
  return undefined;
}

export function isPlaceholderWebPage(html: string): boolean {
  const normalized = html.replace(/\s+/g, " ").toLowerCase();
  const hasPlaceholderTitle =
    normalized.includes('data-testid="app-title"') &&
    normalized.includes(SCAFFOLD_PLACEHOLDER_TITLE);
  const hasProductPageMarker =
    normalized.includes('data-testid="app-page"') ||
    normalized.includes('data-testid="app-nav"') ||
    normalized.includes('data-testid="product-shell"');
  return hasPlaceholderTitle && !hasProductPageMarker;
}

export function hasWebDevScript(repoPath: string): boolean {
  const scripts = readPackageJson(repoPath)?.scripts ?? {};
  return Boolean(scripts.dev || scripts.preview || scripts.start);
}

/** Generated repos with vitest scaffold must ship a browser UI, not library-only code. */
export function shouldEnforceWebLayer(repoPath: string): boolean {
  return (
    fs.existsSync(path.join(repoPath, "vitest.config.ts")) ||
    fs.existsSync(path.join(repoPath, "package.json"))
  );
}

export function assertSliceWebExpectedFiles(
  repoPath: string,
  expectedFiles?: string[],
): { ok: boolean; details: string } {
  if (!expectedFiles?.length) {
    return { ok: true, details: "no expectedFiles listed" };
  }

  const webPaths = expectedFiles.filter(
    (file) =>
      /\.(html|css|tsx|jsx|vue)$/i.test(file) ||
      file.includes("public/") ||
      file.includes("templates/") ||
      file.includes("pages/"),
  );
  if (webPaths.length === 0) {
    return { ok: true, details: "no web paths in expectedFiles" };
  }

  const missing = webPaths.filter((file) => !fs.existsSync(path.join(repoPath, file)));
  if (missing.length > 0) {
    return {
      ok: false,
      details: `missing expected web/UI files: ${missing.join(", ")}`,
    };
  }
  return { ok: true, details: "expected web files present" };
}

export function assertWebLayerDelivered(
  repoPath: string,
  options?: { allowPlaceholder?: boolean },
): { ok: boolean; details: string } {
  if (!shouldEnforceWebLayer(repoPath)) {
    return { ok: true, details: "web layer check skipped (no generated app scaffold)" };
  }

  const allowPlaceholder = options?.allowPlaceholder ?? false;

  if (!hasWebDevScript(repoPath)) {
    return {
      ok: false,
      details:
        "package.json must define a dev, preview, or start script so the app is browser-accessible",
    };
  }

  const html = readPrimaryIndexHtml(repoPath);
  if (!html) {
    return {
      ok: false,
      details: "missing index.html (or public/index.html) — deliver browser UI pages",
    };
  }

  if (!allowPlaceholder && isPlaceholderWebPage(html)) {
    return {
      ok: false,
      details: `index.html is still the scaffold placeholder ("${SCAFFOLD_PLACEHOLDER_TITLE}") — implement product UI pages`,
    };
  }

  return { ok: true, details: "web layer present" };
}

/** Minimal real UI for tests and fixtures. */
export function writeMinimalProductWeb(repoPath: string, title = "Product App"): void {
  fs.mkdirSync(repoPath, { recursive: true });
  fs.writeFileSync(
    path.join(repoPath, "package.json"),
    `${JSON.stringify(
      {
        name: "generated-app",
        private: true,
        scripts: {
          dev: "node scripts/dev-server.mjs",
          preview: "node scripts/dev-server.mjs",
        },
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(
    path.join(repoPath, "index.html"),
    `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8" /><title>${title}</title></head>
  <body data-testid="app-shell">
    <main data-testid="app-page">
      <h1 data-testid="app-title">${title}</h1>
    </main>
  </body>
</html>
`,
  );
}
