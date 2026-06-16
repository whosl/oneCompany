import type { ConsoleSnapshot, EventEnvelope, FileResult, ProjectRecord } from "./types";

const configuredBase = import.meta.env.VITE_API_URL as string | undefined;
export const API_BASE = (configuredBase?.trim() || "/api").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
  const text = await response.text();
  if (!response.ok) {
    let message = text || response.statusText;
    try {
      const parsed = JSON.parse(text) as { error?: string; message?: string };
      message = parsed.error || parsed.message || message;
    } catch {
      // Keep the raw server response.
    }
    throw new Error(message.slice(0, 300));
  }
  return (text ? JSON.parse(text) : {}) as T;
}

const post = <T>(path: string, body: unknown = {}) => request<T>(path, { method: "POST", body: JSON.stringify(body) });

export const api = {
  health: async () => {
    try {
      return (await fetch(`${API_BASE}/health`)).ok;
    } catch {
      return false;
    }
  },
  listProjects: async () => (await request<{ projects: ProjectRecord[] }>("/projects")).projects ?? [],
  createProject: (name: string) => post<ProjectRecord>("/projects", { name }),
  snapshot: (id: string) => request<ConsoleSnapshot>(`/projects/${id}/console/snapshot`),
  listFiles: async (id: string) => (await request<{ files: string[] }>(`/projects/${id}/files?scope=repo`)).files ?? [],
  readFile: (id: string, path: string) => request<FileResult>(`/projects/${id}/files?path=${encodeURIComponent(path)}`),
  fileRawUrl: (id: string, path: string) => `${API_BASE}/projects/${id}/files/raw?path=${encodeURIComponent(path)}`,
  startRequirement: (id: string, requirement: string) => post(`/projects/${id}/requirement/start`, { requirement }),
  submitAnswers: (id: string, answers: string[]) => post(`/projects/${id}/requirement/answers`, { answers }),
  skipClarification: (id: string) => post(`/projects/${id}/requirement/skip`),
  startDevelopment: (id: string) => post(`/projects/${id}/development/start`),
  startTesting: (id: string) => post(`/projects/${id}/testing/start`, { requestDeploy: true }),
  pause: (id: string) => post(`/projects/${id}/pause`),
  resume: (id: string) => post(`/projects/${id}/resume`),
  taizi: (id: string, message: string) => post<{ reply?: string; action?: string }>(`/projects/${id}/taizi/message`, { message }),
  resolveGate: (gateId: string, decision: string, customText?: string) => post(`/gates/${gateId}/resolve`, { decision, ...(customText ? { customText } : {}) }),
  setDeploymentUrl: (id: string, url: string) => post(`/projects/${id}/deployment/url`, { url }),
  startPreview: (id: string) => post<{ url: string; health: { reachable: boolean } }>(`/projects/${id}/preview/start`),
  stopPreview: (id: string) => post(`/projects/${id}/preview/stop`),
  previewStatus: (id: string) => request<{ previewUrl?: string; health: { reachable: boolean } }>(`/projects/${id}/preview/status`),
  exportSubmission: (id: string) => post<{ packagePath: string; deliveryAppPath: string }>(`/projects/${id}/delivery/export`),
  downloadPackageUrl: (id: string) => `${API_BASE}/projects/${id}/delivery/download`,
};

export function openEventStream(
  projectId: string,
  afterSeq: number,
  onEvent: (event: EventEnvelope) => void,
  onConnection: (connected: boolean) => void,
): () => void {
  let stopped = false;
  let cursor = afterSeq;
  let controller: AbortController | undefined;

  const consume = async () => {
    while (!stopped) {
      controller = new AbortController();
      try {
        const response = await fetch(`${API_BASE}/projects/${projectId}/events/stream?afterSeq=${cursor}`, { signal: controller.signal });
        if (!response.ok || !response.body) throw new Error("stream unavailable");
        onConnection(true);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!stopped) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let boundary = buffer.indexOf("\n\n");
          while (boundary !== -1) {
            const chunk = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const line = chunk.split("\n").find((item) => item.startsWith("data:"));
            if (line) {
              try {
                const event = JSON.parse(line.slice(5).trim()) as EventEnvelope;
                if (event.seq === 0 || event.seq > cursor) {
                  if (event.seq > 0) cursor = event.seq;
                  onEvent(event);
                }
              } catch {
                // Ignore malformed frames and wait for the next event.
              }
            }
            boundary = buffer.indexOf("\n\n");
          }
        }
      } catch {
        // Reconnect below unless the component was unmounted.
      }
      onConnection(false);
      if (!stopped) await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  };

  void consume();
  return () => {
    stopped = true;
    controller?.abort();
    onConnection(false);
  };
}
