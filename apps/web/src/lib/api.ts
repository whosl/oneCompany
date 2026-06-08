import type {
  DiffPatchResponse,
  DiffsListResponse,
  FileContentResponse,
  FilesListResponse,
  PreviewStatus,
  ReportSnapshot,
  TestsResultsResponse,
} from "@oc/shared";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    const error = new Error(body.error ?? `Request failed: ${response.status}`);
    Object.assign(error, body);
    throw error;
  }
  return (await response.json()) as T;
}

export const panelApi = {
  listFiles(projectId: string, scope: "repo" | "artifacts" | "all" = "all") {
    return requestJson<FilesListResponse>(`/projects/${projectId}/files?scope=${scope}`);
  },

  readFile(projectId: string, path: string) {
    return requestJson<FileContentResponse>(
      `/projects/${projectId}/files?path=${encodeURIComponent(path)}`,
    );
  },

  listDiffs(projectId: string) {
    return requestJson<DiffsListResponse>(`/projects/${projectId}/diffs`);
  },

  getDiffPatch(projectId: string, diffId: string) {
    return requestJson<DiffPatchResponse>(`/projects/${projectId}/diffs/${diffId}`);
  },

  getTestsResults(projectId: string) {
    return requestJson<TestsResultsResponse>(`/projects/${projectId}/tests/results`);
  },

  getPreviewStatus(projectId: string) {
    return requestJson<PreviewStatus>(`/projects/${projectId}/preview/status`);
  },

  getReport(projectId: string) {
    return requestJson<ReportSnapshot>(`/projects/${projectId}/report`);
  },

  async runCommand(projectId: string, cmd: string) {
    const response = await fetch(`${API_BASE}/projects/${projectId}/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cmd }),
    });
    const body = (await response.json()) as {
      error?: string;
      gateId?: string;
      gateType?: string;
      exitCode?: number;
      outputRef?: { kind: string; text?: string; summary?: string };
    };
    if (!response.ok) {
      const error = new Error(body.error ?? `Command failed: ${response.status}`) as Error & {
        gateId?: string;
        gateType?: string;
      };
      error.gateId = body.gateId;
      error.gateType = body.gateType;
      throw error;
    }
    return body;
  },

  listOpenGates(projectId: string) {
    return requestJson<{ gates: Array<{ id: string; gateType: string; options: string[] }> }>(
      `/projects/${projectId}/gates`,
    );
  },

  resolveGate(gateId: string, decision: string, customText?: string) {
    return requestJson(`/gates/${gateId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, customText }),
    });
  },
};

export type PanelApi = typeof panelApi;
