import { resolveApiUrl } from "./config.js";

export type SidecarHealth = {
  ok: boolean;
  plugin?: { ok: boolean; version?: string };
};

export type ProjectRecord = {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type ConsoleSnapshot = {
  project: ProjectRecord;
  phase: { label: string; activeGroup: string; progressLabel?: string };
  openGates?: Array<{
    id: string;
    gateType: string;
    status: string;
    options: string[];
  }>;
  requirement?: {
    normalizedSummary: string;
    completenessScore: number;
    pendingQuestions?: Array<{ question: string; suggestedAnswers: string[] }>;
  };
  dev?: {
    currentSliceId?: string;
    sliceIndex: number;
    sliceTotal: number;
  };
};

async function requestJson<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(init?.method === "POST" ? 900_000 : 30_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export async function checkSidecarHealth(apiUrl = resolveApiUrl()): Promise<SidecarHealth> {
  try {
    const health = await requestJson<{ ok: boolean }>(apiUrl, "/health");
    const plugin = await requestJson<{ ok: boolean; version?: string }>(apiUrl, "/plugin/health");
    return { ok: health.ok === true, plugin };
  } catch {
    return { ok: false };
  }
}

export async function ensureSidecar(apiUrl = resolveApiUrl()): Promise<void> {
  const health = await checkSidecarHealth(apiUrl);
  if (!health.ok) {
    throw new Error(
      `OneCompany sidecar not reachable at ${apiUrl}. Run: onecompany daemon (or pnpm api)`,
    );
  }
}

export async function listProjects(apiUrl = resolveApiUrl()): Promise<ProjectRecord[]> {
  const body = await requestJson<{ projects?: ProjectRecord[] }>(apiUrl, "/projects");
  return body.projects ?? [];
}

export async function createProject(name: string, apiUrl = resolveApiUrl()): Promise<ProjectRecord> {
  return requestJson<ProjectRecord>(apiUrl, "/projects", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function fetchSnapshot(projectId: string, apiUrl = resolveApiUrl()): Promise<ConsoleSnapshot> {
  return requestJson<ConsoleSnapshot>(apiUrl, `/projects/${projectId}/console/snapshot`);
}

export async function taiziMessage(
  projectId: string,
  message: string,
  apiUrl = resolveApiUrl(),
): Promise<{ reply: string; action: string; intent: string }> {
  return requestJson(apiUrl, `/projects/${projectId}/taizi/message`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function linkOpencodeSession(
  input: { projectId: string; sessionId: string; directory: string; role?: string },
  apiUrl = resolveApiUrl(),
): Promise<void> {
  await requestJson(apiUrl, "/plugin/opencode/session-link", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function forwardOpencodeEvent(
  input: {
    projectId?: string;
    sessionId?: string;
    directory?: string;
    eventType: string;
    payload: unknown;
  },
  apiUrl = resolveApiUrl(),
): Promise<void> {
  await requestJson(apiUrl, "/plugin/opencode/event", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
