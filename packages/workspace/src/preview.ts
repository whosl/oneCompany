import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type PreviewHandle = {
  url: string;
  publicPath?: string;
  port: number;
  stop: () => Promise<void>;
};

export class PreviewStartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreviewStartError";
  }
}

const previewRegistry = new Map<string, PreviewHandle>();

export function buildPreviewPublicPath(projectId: string): string {
  return `/preview/${encodeURIComponent(projectId)}/`;
}

export type StartPreviewInput = {
  projectId: string;
  repoPath?: string;
  publicBasePath?: string;
  port?: number;
  host?: string;
  readyTimeoutMs?: number;
};

type PreviewCommand = {
  command: string;
  shell: boolean;
};

type PackageJson = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function findFreePort(host: string, preferredPort?: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(preferredPort ?? 0, host, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Failed to resolve preview port"));
        return;
      }
      const port = address.port;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

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

export function resolvePreviewCommand(repoPath: string): PreviewCommand | null {
  const pkg = readPackageJson(repoPath);
  const scripts = pkg?.scripts ?? {};
  const hasVite = Boolean(pkg?.dependencies?.vite || pkg?.devDependencies?.vite);

  if (scripts.dev) {
    return {
      command: hasVite
        ? "pnpm exec vite --base ${PREVIEW_BASE_PATH:-/}"
        : "pnpm dev",
      shell: true,
    };
  }
  if (scripts.preview) {
    return { command: "pnpm preview", shell: true };
  }
  if (scripts.start) {
    if (scripts.build) {
      return { command: "pnpm build && pnpm start", shell: true };
    }
    return { command: "pnpm start", shell: true };
  }

  return null;
}

function fallbackPreviewCommand(): PreviewCommand {
  const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "preview-fallback.mjs");
  return { command: `node "${scriptPath}"`, shell: true };
}

async function waitForPreviewReady(
  url: string,
  timeoutMs: number,
): Promise<{ reachable: boolean; statusCode?: number }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const health = await getPreviewHealth(url);
    if (health.reachable) {
      return health;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return { reachable: false };
}

function killProcessTree(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (!child.pid) {
      resolve();
      return;
    }

    const onExit = () => {
      child.removeListener("exit", onExit);
      resolve();
    };
    child.once("exit", onExit);

    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      try {
        child.kill("SIGTERM");
      } catch {
        onExit();
        return;
      }
    }

    setTimeout(() => {
      try {
        if (child.pid) {
          process.kill(-child.pid, "SIGKILL");
        }
      } catch {
        try {
          child.kill("SIGKILL");
        } catch {
          // already exited
        }
      }
    }, 2_000);
  });
}

async function spawnPreviewProcess(input: {
  repoPath: string;
  host: string;
  port: number;
  publicBasePath?: string;
}): Promise<{ child: ChildProcess; url: string }> {
  const resolved = resolvePreviewCommand(input.repoPath) ?? fallbackPreviewCommand();
  const publicBasePath = input.publicBasePath ?? "/";
  const env = {
    ...process.env,
    PORT: String(input.port),
    PREVIEW_PORT: String(input.port),
    PREVIEW_HOST: input.host,
    PREVIEW_ROOT: input.repoPath,
    PREVIEW_BASE_PATH: publicBasePath,
    VITE_PREVIEW_BASE_PATH: publicBasePath,
    HOST: input.host,
  };

  const child = spawn(resolved.command, {
    cwd: input.repoPath,
    env,
    shell: resolved.shell,
    detached: true,
    stdio: "ignore",
  });

  child.unref();

  const url = `http://127.0.0.1:${input.port}`;
  return { child, url };
}

export async function startPreview(input: StartPreviewInput): Promise<PreviewHandle> {
  const existing = previewRegistry.get(input.projectId);
  if (existing) {
    return existing;
  }

  const host = input.host ?? process.env.OC_PREVIEW_HOST ?? "0.0.0.0";
  const repoPath = input.repoPath ? path.resolve(input.repoPath) : process.cwd();
  fs.mkdirSync(repoPath, { recursive: true });

  const preferredPort = input.port ?? (process.env.OC_PREVIEW_PORT ? Number(process.env.OC_PREVIEW_PORT) : undefined);
  const port = await findFreePort(host, preferredPort);
  const publicBasePath = input.publicBasePath;
  const { child, url } = await spawnPreviewProcess({ repoPath, host, port, publicBasePath });
  const healthUrl = new URL(publicBasePath ?? "/", url).toString();

  const health = await waitForPreviewReady(healthUrl, input.readyTimeoutMs ?? 30_000);
  if (!health.reachable) {
    await killProcessTree(child);
    throw new PreviewStartError(`Preview server did not become reachable at ${url}`);
  }

  const handle: PreviewHandle = {
    url,
    publicPath: publicBasePath,
    port,
    stop: async () => {
      await killProcessTree(child);
      previewRegistry.delete(input.projectId);
    },
  };

  previewRegistry.set(input.projectId, handle);
  return handle;
}

export async function stopPreview(projectId: string): Promise<void> {
  const handle = previewRegistry.get(projectId);
  if (!handle) {
    return;
  }
  await handle.stop();
}

export function getPreviewHandle(projectId: string): PreviewHandle | undefined {
  return previewRegistry.get(projectId);
}

export async function getPreviewHealth(url: string): Promise<{
  reachable: boolean;
  statusCode?: number;
}> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return { reachable: response.ok, statusCode: response.status };
  } catch {
    return { reachable: false };
  }
}

export function clearPreviewRegistry(): void {
  for (const handle of previewRegistry.values()) {
    void handle.stop();
  }
  previewRegistry.clear();
}
