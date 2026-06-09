import { createHash } from "node:crypto";
import path from "node:path";
import { createOpencodeServer } from "@opencode-ai/sdk";

export type ProjectServer = {
  url: string;
  close(): Promise<void>;
};

const activeServers = new Map<string, ProjectServer>();

function portForRepo(repoPath: string): number {
  const hash = createHash("sha256").update(repoPath).digest();
  const offset = hash.readUInt16BE(0) % 900;
  return 4100 + offset;
}

function governedConfig() {
  // Model is selected per prompt in OpencodeHarness; server-level model config can
  // break session.create on some opencode builds when auth is injected later.
  return {
    permission: {
      edit: "ask" as const,
      bash: "ask" as const,
    },
  };
}

async function startServerOnPort(port: number): Promise<ProjectServer> {
  const server = await createOpencodeServer({
    hostname: "127.0.0.1",
    port,
    timeout: 15_000,
    config: governedConfig(),
  });

  return {
    url: server.url,
    async close() {
      server.close();
    },
  };
}

function normalizeRepoPath(repoPath: string): string {
  return path.resolve(repoPath);
}

export async function startProjectServer(repoPath: string): Promise<ProjectServer> {
  const resolved = normalizeRepoPath(repoPath);
  const existing = activeServers.get(resolved);
  if (existing) {
    return existing;
  }

  const basePort = portForRepo(resolved);
  let lastError: unknown;
  let started: ProjectServer | undefined;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const port = basePort + attempt;
    try {
      started = await startServerOnPort(port);
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
      : new Error("Failed to start opencode server on loopback");
  }

  const server = started;

  const handle: ProjectServer = {
    url: server.url,
    async close() {
      if (activeServers.get(resolved) !== handle) {
        return;
      }
      activeServers.delete(resolved);
      await server.close();
    },
  };

  activeServers.set(resolved, handle);
  return handle;
}

export async function releaseProjectServer(repoPath: string): Promise<void> {
  const server = activeServers.get(normalizeRepoPath(repoPath));
  if (!server) {
    return;
  }
  await server.close();
}
