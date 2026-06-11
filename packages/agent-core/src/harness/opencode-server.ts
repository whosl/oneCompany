import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import type { Config } from "@opencode-ai/sdk";
import { buildOcGatewayMcpConfig } from "./opencode-gateway-mcp.js";
import { resolveOpencodeExecutable } from "../util/opencode-cli.js";

export type ProjectServer = {
  url: string;
  close(): Promise<void>;
};

const activeServers = new Map<string, ProjectServer>();

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

function governedConfig(options?: { projectId?: string }) {
  // Model is selected per prompt in OpencodeHarness; server-level model config can
  // break session.create on some opencode builds when auth is injected later.
  const mcp = options?.projectId ? buildOcGatewayMcpConfig(options.projectId) : undefined;
  return {
    permission: {
      edit: "ask" as const,
      bash: "ask" as const,
    },
    ...(mcp ? { mcp: mcp as Config["mcp"] } : {}),
  };
}

async function spawnCodingServer(
  port: number,
  options?: { projectId?: string; timeoutMs?: number },
): Promise<ProjectServer> {
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
    async close() {
      proc.kill();
    },
  };
}

function normalizeRepoPath(repoPath: string): string {
  return path.resolve(repoPath);
}

export async function startProjectServer(
  repoPath: string,
  options?: { projectId?: string },
): Promise<ProjectServer> {
  const resolved = normalizeRepoPath(repoPath);
  const cacheKey = `${resolved}:${options?.projectId ?? ""}`;
  const existing = activeServers.get(cacheKey);
  if (existing) {
    return existing;
  }

  const basePort = portForRepo(resolved);
  let lastError: unknown;
  let started: ProjectServer | undefined;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const port = basePort + attempt;
    try {
      started = await spawnCodingServer(port, options);
      break;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("port") && !message.includes("ServeError")) {
        throw error;
      }
    }
  }

  if (!started) {
    throw lastError instanceof Error
      ? lastError
      : new Error("Failed to start coding server on loopback");
  }

  const server = started;

  const handle: ProjectServer = {
    url: server.url,
    async close() {
      if (activeServers.get(cacheKey) !== handle) {
        return;
      }
      activeServers.delete(cacheKey);
      await server.close();
    },
  };

  activeServers.set(cacheKey, handle);
  return handle;
}

export async function releaseProjectServer(repoPath: string): Promise<void> {
  const server = activeServers.get(normalizeRepoPath(repoPath));
  if (!server) {
    return;
  }
  await server.close();
}
