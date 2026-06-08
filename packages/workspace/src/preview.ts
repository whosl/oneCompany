import http from "node:http";
import type { AddressInfo } from "node:net";

export type PreviewHandle = {
  url: string;
  port: number;
  stop: () => Promise<void>;
};

const previewRegistry = new Map<string, PreviewHandle>();

export type StartPreviewInput = {
  projectId: string;
  port?: number;
  host?: string;
};

async function listenOnFreePort(
  host: string,
  preferredPort?: number,
): Promise<{ server: http.Server; port: number }> {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("preview ok");
  });

  const tryListen = (port: number) =>
    new Promise<number>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => {
        server.removeListener("error", reject);
        const address = server.address() as AddressInfo;
        resolve(address.port);
      });
    });

  const port = await tryListen(preferredPort ?? 0);
  return { server, port };
}

export async function startPreview(input: StartPreviewInput): Promise<PreviewHandle> {
  const existing = previewRegistry.get(input.projectId);
  if (existing) {
    return existing;
  }

  const host = input.host ?? "127.0.0.1";
  const { server, port } = await listenOnFreePort(host, input.port);
  const url = `http://${host}:${port}`;

  const handle: PreviewHandle = {
    url,
    port,
    stop: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
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
