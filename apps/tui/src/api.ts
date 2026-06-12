import type {
  ChangeRequestResult,
  ConsoleSnapshot,
  DevelopmentRunResult,
  GateInfo,
  Json,
  ProjectRecord,
  Readiness,
  RequirementRunResult,
  TestingRunResult,
} from "./types.js";

/** Full-surface HTTP client for the OneCompany API (no auth, long timeouts). */
export class ApiClient {
  constructor(private readonly base: string) {}

  /* -- environment ------------------------------------------------- */

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.base}/health`, { signal: AbortSignal.timeout(5_000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  readiness(): Promise<Readiness> {
    return this.get("/environment/readiness") as Promise<Readiness>;
  }

  /* -- projects ----------------------------------------------------- */

  async listProjects(): Promise<ProjectRecord[]> {
    const body = await this.get("/projects");
    return (body.projects as ProjectRecord[]) ?? [];
  }

  createProject(name: string): Promise<ProjectRecord> {
    return this.post("/projects", { name }) as Promise<ProjectRecord>;
  }

  getProject(id: string): Promise<ProjectRecord> {
    return this.get(`/projects/${id}`) as Promise<ProjectRecord>;
  }

  pauseProject(id: string): Promise<ProjectRecord> {
    return this.post(`/projects/${id}/pause`, {}) as Promise<ProjectRecord>;
  }

  resumeProject(id: string): Promise<ProjectRecord> {
    return this.post(`/projects/${id}/resume`, {}) as Promise<ProjectRecord>;
  }

  snapshot(projectId: string): Promise<ConsoleSnapshot> {
    return this.get(`/projects/${projectId}/console/snapshot`) as Promise<ConsoleSnapshot>;
  }

  async readFile(
    projectId: string,
    path: string,
  ): Promise<{ path: string; content: string; binary?: boolean; absolutePath?: string }> {
    const body = await this.get(`/projects/${projectId}/files?path=${encodeURIComponent(path)}`);
    return {
      path: String(body.path ?? path),
      content: String(body.content ?? ""),
      binary: body.binary === true,
      absolutePath: typeof body.absolutePath === "string" ? body.absolutePath : undefined,
    };
  }

  /* -- requirement --------------------------------------------------- */

  startRequirement(
    projectId: string,
    requirement: string,
    profile?: string,
  ): Promise<RequirementRunResult> {
    const body: Json = { requirement };
    if (profile) body.profile = profile;
    return this.post(
      `/projects/${projectId}/requirement/start`,
      body,
    ) as Promise<RequirementRunResult>;
  }

  submitAnswers(projectId: string, answers: string[]): Promise<RequirementRunResult> {
    return this.post(`/projects/${projectId}/requirement/answers`, {
      answers,
    }) as Promise<RequirementRunResult>;
  }

  skipClarification(projectId: string): Promise<RequirementRunResult> {
    return this.post(`/projects/${projectId}/requirement/skip`, {}) as Promise<RequirementRunResult>;
  }

  async listFiles(projectId: string, scope: "repo" | "all" = "repo"): Promise<string[]> {
    const body = await this.get(`/projects/${projectId}/files?scope=${scope}`);
    return (body.files as string[]) ?? [];
  }

  exportSubmission(projectId: string): Promise<{ packagePath: string; generatedAppPath: string; files: string[] }> {
    return this.post(`/projects/${projectId}/delivery/export`, {}) as Promise<{
      packagePath: string;
      generatedAppPath: string;
      files: string[];
    }>;
  }

  /* -- development / testing / deployment --------------------------- */

  startDevelopment(projectId: string, profile?: string): Promise<DevelopmentRunResult> {
    const body: Json = {};
    if (profile) body.profile = profile;
    return this.post(
      `/projects/${projectId}/development/start`,
      body,
    ) as Promise<DevelopmentRunResult>;
  }

  developmentStatus(projectId: string): Promise<DevelopmentRunResult> {
    return this.get(`/projects/${projectId}/development/status`) as Promise<DevelopmentRunResult>;
  }

  startTesting(projectId: string, requestDeploy = true): Promise<TestingRunResult> {
    return this.post(`/projects/${projectId}/testing/start`, {
      requestDeploy,
    }) as Promise<TestingRunResult>;
  }

  setDeploymentUrl(projectId: string, url: string): Promise<Json> {
    return this.post(`/projects/${projectId}/deployment/url`, { url });
  }

  generateDelivery(projectId: string): Promise<Json> {
    return this.post(`/projects/${projectId}/delivery/generate`, {});
  }

  /* -- gates / change requests --------------------------------------- */

  async listOpenGates(projectId: string): Promise<GateInfo[]> {
    const body = await this.get(`/projects/${projectId}/gates`);
    const gates = (body.gates as GateInfo[]) ?? [];
    return gates.filter((gate) => gate.status === "open");
  }

  resolveGate(gateId: string, decision: string, customText?: string): Promise<Json> {
    const body: Json = { decision };
    if (customText) body.customText = customText;
    return this.post(`/gates/${gateId}/resolve`, body);
  }

  /**
   * Interject into the live coding session. Returns `delivered: false` when
   * no session is running (caller should fall back to a change request).
   */
  interrupt(
    projectId: string,
    message: string,
    abort = false,
  ): Promise<{ delivered: boolean }> {
    return this.post(`/projects/${projectId}/interrupt`, { message, abort }) as Promise<{
      delivered: boolean;
    }>;
  }

  /**
   * Taizi（太子）调度：任意自由文本统一入口。服务端分类意图并分发，
   * 立即返回路由结果；长动作进度走事件流。
   */
  taiziMessage(
    projectId: string,
    message: string,
  ): Promise<{
    intent: string;
    action: string;
    reply: string;
    stateChanged: boolean;
    openPath?: string;
  }> {
    return this.post(`/projects/${projectId}/taizi/message`, { message }) as Promise<{
      intent: string;
      action: string;
      reply: string;
      stateChanged: boolean;
      openPath?: string;
    }>;
  }

  createChangeRequest(
    projectId: string,
    summary: string,
    kind: "skip_slice" | "requirement_change" = "requirement_change",
  ): Promise<ChangeRequestResult> {
    return this.post(`/projects/${projectId}/change-requests`, {
      summary,
      kind,
    }) as Promise<ChangeRequestResult>;
  }

  /* -- transport ------------------------------------------------------ */

  private get(path: string): Promise<Json> {
    return this.request("GET", path);
  }

  private post(path: string, body: Json): Promise<Json> {
    return this.request("POST", path, body);
  }

  /** Workflow steps can block for minutes server-side; keep a generous timeout. */
  private async request(method: "GET" | "POST", path: string, body?: Json): Promise<Json> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(900_000),
    });
    const text = await res.text();
    if (!res.ok) {
      let detail = text;
      try {
        const parsed = JSON.parse(text) as Json;
        detail = String(parsed.error ?? parsed.message ?? text);
      } catch {
        /* keep raw text */
      }
      throw new Error(`${method} ${path} → ${res.status}: ${detail.slice(0, 200)}`);
    }
    return text ? (JSON.parse(text) as Json) : {};
  }
}
