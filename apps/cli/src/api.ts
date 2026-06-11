import type {
  ConsoleSnapshot,
  DevelopmentRunResult,
  GateRecord,
  Json,
  ProjectRecord,
  Readiness,
  RequirementRunResult,
  TestingRunResult,
} from "./types.js";

export class ApiClient {
  constructor(private readonly base: string) {}

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.base}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async readiness(): Promise<Readiness> {
    return this.get("/environment/readiness") as Promise<Readiness>;
  }

  async createProject(name: string): Promise<ProjectRecord> {
    return this.post("/projects", { name }) as Promise<ProjectRecord>;
  }

  async getProject(id: string): Promise<ProjectRecord> {
    return this.get(`/projects/${id}`) as Promise<ProjectRecord>;
  }

  async startRequirement(
    projectId: string,
    requirement: string,
    profile?: string,
  ): Promise<RequirementRunResult> {
    const body: Json = { requirement };
    if (profile) body.profile = profile;
    return this.post(`/projects/${projectId}/requirement/start`, body) as Promise<RequirementRunResult>;
  }

  async submitAnswers(projectId: string, answers: string[]): Promise<RequirementRunResult> {
    return this.post(`/projects/${projectId}/requirement/answers`, {
      answers,
    }) as Promise<RequirementRunResult>;
  }

  async startDevelopment(projectId: string, profile?: string): Promise<DevelopmentRunResult> {
    const body: Json = {};
    if (profile) body.profile = profile;
    return this.post(`/projects/${projectId}/development/start`, body) as Promise<DevelopmentRunResult>;
  }

  async developmentStatus(projectId: string): Promise<DevelopmentRunResult> {
    return this.get(`/projects/${projectId}/development/status`) as Promise<DevelopmentRunResult>;
  }

  async startTesting(projectId: string, requestDeploy = true): Promise<TestingRunResult> {
    return this.post(`/projects/${projectId}/testing/start`, {
      requestDeploy,
    }) as Promise<TestingRunResult>;
  }

  async setDeploymentUrl(projectId: string, url: string): Promise<Json> {
    return this.post(`/projects/${projectId}/deployment/url`, { url });
  }

  async listGates(projectId: string): Promise<GateRecord[]> {
    const body = await this.get(`/projects/${projectId}/gates`);
    const gates = (body.gates as GateRecord[]) ?? [];
    return gates.filter((g) => g.status === "open");
  }

  async resolveGate(gateId: string, decision: string): Promise<GateRecord> {
    return this.post(`/gates/${gateId}/resolve`, { decision }) as Promise<GateRecord>;
  }

  async snapshot(projectId: string): Promise<ConsoleSnapshot> {
    return this.get(`/projects/${projectId}/console/snapshot`) as Promise<ConsoleSnapshot>;
  }

  private async get(path: string): Promise<Json> {
    return this.request("GET", path);
  }

  private async post(path: string, body: Json): Promise<Json> {
    return this.request("POST", path, body);
  }

  /** LangGraph + LLM steps can run several minutes; avoid client-side fetch timeouts. */
  private async request(method: "GET" | "POST", path: string, body?: Json): Promise<Json> {
    const init: RequestInit = {
      method,
      headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(600_000),
    };

    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const res = await fetch(`${this.base}${path}`, init);
        const text = await res.text();
        if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
        return text ? (JSON.parse(text) as Json) : {};
      } catch (error) {
        lastError = error;
        if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}
