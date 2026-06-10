import type {
  ConsoleSnapshot,
  DiffPatchResponse,
  DiffsListResponse,
  EnvironmentReadiness,
  FileContentResponse,
  FilesListResponse,
  IntegrationConnection,
  IntegrationDefinition,
  IntegrationStatusSnapshot,
  PreviewStatus,
  ReportSnapshot,
  SkillPack,
  TestsResultsResponse,
} from "@oc/shared";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

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

export type ProjectSummary = {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export const consoleApi = {
  listProjects() {
    return requestJson<{ projects: ProjectSummary[] }>("/projects");
  },

  createProject(name: string) {
    return requestJson<ProjectSummary>("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
  },

  getSnapshot(projectId: string) {
    return requestJson<ConsoleSnapshot>(`/projects/${projectId}/console/snapshot`);
  },

  pauseProject(projectId: string) {
    return requestJson<ProjectSummary>(`/projects/${projectId}/pause`, { method: "POST" });
  },

  resumeProject(projectId: string) {
    return requestJson<ProjectSummary>(`/projects/${projectId}/resume`, { method: "POST" });
  },

  getEnvironmentReadiness() {
    return requestJson<EnvironmentReadiness>("/environment/readiness");
  },

  startRequirement(projectId: string, requirement: string) {
    return requestJson(`/projects/${projectId}/requirement/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requirement }),
    });
  },

  submitRequirementAnswers(projectId: string, answers: string[]) {
    return requestJson(`/projects/${projectId}/requirement/answers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });
  },

  startDevelopment(projectId: string) {
    return requestJson(`/projects/${projectId}/development/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  },

  resolveGate: panelApi.resolveGate,
  listOpenGates: panelApi.listOpenGates,

  startTesting(projectId: string, requestDeploy = false) {
    return requestJson(`/projects/${projectId}/testing/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestDeploy }),
    });
  },

  submitDeploymentUrl(projectId: string, url: string) {
    return requestJson(`/projects/${projectId}/deployment/url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
  },

  createChangeRequest(projectId: string, summary: string, details?: string) {
    return requestJson(`/projects/${projectId}/change-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary, kind: "requirement_change", details }),
    });
  },
};

export type ConsoleApi = typeof consoleApi;

export type IntegrationGatewayMeta = {
  adapterMode: "mock" | "real";
  gateMode: "sync" | "async";
  skillPacksRoot: string;
};

export const integrationsApi = {
  listDefinitions() {
    return requestJson<{
      integrations: IntegrationDefinition[];
      gateway: IntegrationGatewayMeta;
    }>("/integrations");
  },

  listSkillPacks() {
    return requestJson<{ skillPacks: SkillPack[] }>("/integrations/skill-packs");
  },

  listProjectStatus(projectId: string) {
    return requestJson<{ integrations: IntegrationStatusSnapshot[] }>(
      `/projects/${projectId}/integrations`,
    );
  },

  enable(projectId: string, integrationId: string, scopes: string[]) {
    return requestJson<IntegrationConnection>(
      `/projects/${projectId}/integrations/${integrationId}/enable`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopes }),
      },
    );
  },

  callTool(projectId: string, integrationId: string, toolName: string, args?: unknown) {
    return requestJson<{
      mode: "remote" | "offline" | "pending";
      output: unknown;
      artifactPath?: string;
      integrationToolCallId: string;
      gateId?: string;
    }>(`/projects/${projectId}/integrations/${integrationId}/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolName, args }),
    });
  },
};

export type IntegrationsApi = typeof integrationsApi;
