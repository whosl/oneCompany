import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import type { Config } from "@opencode-ai/sdk";
import { buildOcGatewayMcpConfig } from "./opencode-gateway-mcp.js";
import { resolveOpencodeExecutable } from "../util/opencode-cli.js";

export type ProjectServer = {
  url: string;
  close(): Promise<void>;
};

type CachedServer = {
  url: string;
  /** When set, this process was spawned by us and may be killed on release. */
  proc?: ChildProcess;
};

const activeServers = new Map<string, CachedServer>();

const SERVER_LISTENING_RE =
  /(?:opencode|mimocode) server listening on\s+(https?:\/\/[^\s]+)/;

export function parseCodingServerListeningUrl(output: string): string | undefined {
  for (const line of output.split("\n")) {
    const match = line.match(SERVER_LISTENING_RE);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

function portForRepo(repoPath: string): number {
  const hash = createHash("sha256").update(repoPath).digest();
  const offset = hash.readUInt16BE(0) % 900;
  return 4100 + offset;
}

function governedConfig(options?: {
  projectId?: string;
  /** Pre-resolved project-level MCP servers in opencode Config["mcp"] shape. */
  projectMcp?: Record<string, unknown>;
}) {
  // Model is selected per prompt in OpencodeHarness; server-level model config can
  // break session.create on some opencode builds when auth is injected later.
  const gatewayMcp = options?.projectId ? buildOcGatewayMcpConfig(options.projectId) : undefined;
  // Defense in depth: strip any project MCP whose key would shadow the reserved
  // oc-* namespace (the governance gateway). This prevents a user-registered
  // "oc-gateway" entry from replacing the official governed gateway even if the
  // API-layer validation is bypassed.
  const safeProjectMcp: Record<string, unknown> = {};
  if (options?.projectMcp) {
    for (const [key, value] of Object.entries(options.projectMcp)) {
      if (!key.toLowerCase().startsWith("oc-")) {
        safeProjectMcp[key] = value;
      }
    }
  }
  const mcp = { ...gatewayMcp, ...safeProjectMcp };
  return {
    permission: {
      edit: "ask" as const,
      bash: "ask" as const,
    },
    ...(Object.keys(mcp).length > 0 ? { mcp: mcp as Config["mcp"] } : {}),
  };
}

function isRetriableServerStartError(message: string): boolean {
  return /port|ServeError|database|locked|EADDRINUSE|EBUSY|exit/i.test(message);
}

async function probeServerHealth(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2_000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function spawnCodingServer(
  port: number,
  options?: { projectId?: string; timeoutMs?: number; projectMcp?: Record<string, unknown> },
): Promise<CachedServer> {
  const executable = resolveOpencodeExecutable();
  if (!executable) {
    throw new Error(
      "Coding CLI not found. Install mimo (or opencode) or set OC_OPENCODE_BIN.",
    );
  }

  const hostname = "127.0.0.1";
  const timeoutMs = options?.timeoutMs ?? 15_000;
  const config = governedConfig(options);

  const proc = spawn(executable, [`serve`, `--hostname=${hostname}`, `--port=${port}`], {
    env: {
      ...process.env,
      OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
    },
  });

  const url = await new Promise<string>((resolve, reject) => {
    const id = setTimeout(() => {
      reject(new Error(`Timeout waiting for coding server to start after ${timeoutMs}ms`));
    }, timeoutMs);

    let output = "";

    const tryResolve = () => {
      const parsed = parseCodingServerListeningUrl(output);
      if (parsed) {
        clearTimeout(id);
        resolve(parsed);
      }
    };

    proc.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      tryResolve();
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      tryResolve();
    });

    proc.on("exit", (code) => {
      clearTimeout(id);
      let msg = `Coding server exited with code ${code}`;
      if (output.trim()) {
        msg += `\nServer output: ${output}`;
      }
      reject(new Error(msg));
    });

    proc.on("error", (error) => {
      clearTimeout(id);
      reject(error);
    });
  });

  return {
    url,
    proc,
  };
}

function normalizeRepoPath(repoPath: string): string {
  return path.resolve(repoPath);
}

function serverCacheKey(repoPath: string, projectId?: string): string {
  return `${repoPath}:${projectId ?? ""}`;
}

function toHandle(cached: CachedServer): ProjectServer {
  return {
    url: cached.url,
    async close() {
      if (cached.proc) {
        cached.proc.kill();
      }
    },
  };
}

export async function startProjectServer(
  repoPath: string,
  options?: { projectId?: string; projectMcp?: Record<string, unknown> },
): Promise<ProjectServer> {
  const resolved = normalizeRepoPath(repoPath);
  const cacheKey = serverCacheKey(resolved, options?.projectId);
  const existing = activeServers.get(cacheKey);
  if (existing && (await probeServerHealth(existing.url))) {
    return toHandle(existing);
  }
  if (existing) {
    activeServers.delete(cacheKey);
    await toHandle(existing).close();
  }

  const basePort = portForRepo(resolved);
  let lastError: unknown;
  let started: CachedServer | undefined;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const port = basePort + attempt;
    const url = `http://127.0.0.1:${port}`;
    if (await probeServerHealth(url)) {
      started = { url };
      break;
    }
    try {
      started = await spawnCodingServer(port, options);
      break;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!isRetriableServerStartError(message)) {
        throw error;
      }
    }
  }

  if (!started) {
    throw lastError instanceof Error
      ? lastError
      : new Error("Failed to start coding server on loopback");
  }

  activeServers.set(cacheKey, started);
  return toHandle(started);
}

/** Drop a cached server without killing externally-owned listeners. */
export async function releaseProjectServer(
  repoPath: string,
  options?: { projectId?: string },
): Promise<void> {
  const cacheKey = serverCacheKey(normalizeRepoPath(repoPath), options?.projectId);
  const server = activeServers.get(cacheKey);
  if (!server) {
    return;
  }
  activeServers.delete(cacheKey);
  if (server.proc) {
    server.proc.kill();
  }
}

/** Force-stop any cached coding server for a project (e.g. when development halts). */
export async function shutdownProjectServer(
  repoPath: string,
  options?: { projectId?: string },
): Promise<void> {
  await releaseProjectServer(repoPath, options);
}
