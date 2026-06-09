import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  StubHarness,
  getOpenAiApiKey,
  isOpencodeAvailable,
} from "@oc/agent-core";
import {
  acceptanceCriteriaVersions,
  events,
  prdVersions,
  projects,
  testResults,
} from "@oc/shared";
import { createDevelopmentDeps } from "../development/deps.js";
import { setupIntegrationApp } from "./test-utils.js";

const COMPLETE_REQUIREMENT = [
  "Build a TypeScript calendar application for tracking compensatory time off (调休).",
  "Users can log overtime work days and earn 调休 balance (e.g. 1 day overtime → 1 day 调休).",
  "Show a monthly calendar view marking workdays, overtime, and scheduled 调休 days.",
  "Track remaining 调休 balance and a consumption history with dates and reasons.",
  "Persist calendar and balance data in local JSON under the project workspace.",
  "Use vitest for unit tests covering balance accrual, consume 调休, and calendar helpers.",
  "Ship as an npm package with a simple preview/dev server entry.",
  "Acceptance: all vitest tests pass under strict TypeScript.",
].join(" ");

function seedPrdReady(db: ReturnType<typeof setupIntegrationApp>["db"], projectId: string): void {
  const now = new Date().toISOString();
  db.insert(projects)
    .values({
      id: projectId,
      name: "Golden Path Project",
      slug: `golden-${projectId.slice(0, 8)}`,
      status: "PRD Ready",
      created_at: now,
      updated_at: now,
    })
    .run();
  db.insert(prdVersions)
    .values({
      id: randomUUID(),
      project_id: projectId,
      version: "prd-1",
      content: "# PRD\n\n调休 tracking calendar with monthly view, balance accrual, and vitest coverage.",
      created_at: now,
    })
    .run();
  db.insert(acceptanceCriteriaVersions)
    .values({
      id: randomUUID(),
      project_id: projectId,
      version: "ac-1",
      content:
        "- Users can accrue and consume 调休 with balance tracking\n- Monthly calendar shows overtime and 调休 days\n- vitest suite passes",
      created_at: now,
    })
    .run();
}

type RequirementResult = {
  phase: string;
  projectStatus: string;
  questions?: string[];
  gateId?: string;
};

async function runRequirementToPrdReady(
  app: ReturnType<typeof setupIntegrationApp>["app"],
  projectId: string,
): Promise<RequirementResult> {
  const started = await app.request(`/projects/${projectId}/requirement/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requirement: COMPLETE_REQUIREMENT }),
  });
  expect(started.status).toBe(200);
  let result = (await started.json()) as RequirementResult;

  for (let round = 0; round < 5 && result.phase === "awaiting_answers"; round += 1) {
    const questions = result.questions ?? ["Provide more detail"];
    const answers = questions.map(
      (question, index) =>
        `Round ${round + 1} answer ${index + 1} for "${question}": TypeScript 调休 calendar app with monthly view, JSON persistence, balance accrual/consume APIs, and vitest coverage.`,
    );
    const response = await app.request(`/projects/${projectId}/requirement/answers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });
    expect(response.status).toBe(200);
    result = (await response.json()) as RequirementResult;
  }

  if (result.phase === "awaiting_gate" && result.gateId) {
    const resolved = await app.request(`/gates/${result.gateId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "force_continue" }),
    });
    expect(resolved.status).toBe(200);
    await waitForProjectStatus(app, projectId, "PRD Ready", 120_000);
    result = { phase: "completed", projectStatus: "PRD Ready" };
  }

  return result;
}

async function listOpenGates(
  app: ReturnType<typeof setupIntegrationApp>["app"],
  projectId: string,
): Promise<Array<{ id: string; gateType: string; status: string }>> {
  const response = await app.request(`/projects/${projectId}/gates`);
  const body = (await response.json()) as { gates?: Array<{ id: string; gateType: string; status: string }> };
  return (body.gates ?? []).filter((gate) => gate.status === "open");
}

async function resolveNestedGates(
  app: ReturnType<typeof setupIntegrationApp>["app"],
  projectId: string,
  primaryGateId: string,
): Promise<void> {
  for (const gate of await listOpenGates(app, projectId)) {
    if (gate.id === primaryGateId) continue;
    const decision =
      gate.gateType === "dangerous_operation" || gate.gateType === "deployment"
        ? "approve"
        : gate.gateType === "slice_failure"
          ? "retry"
          : "force_continue";
    await app.request(`/gates/${gate.id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
  }
}

async function resolveGateWithNested(
  app: ReturnType<typeof setupIntegrationApp>["app"],
  projectId: string,
  gateId: string,
  decision: string,
): Promise<void> {
  const poller = setInterval(() => {
    void resolveNestedGates(app, projectId, gateId);
  }, 400);
  try {
    const resolved = await app.request(`/gates/${gateId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    expect(resolved.status).toBe(200);
  } finally {
    clearInterval(poller);
  }
}

async function waitForProjectStatus(
  app: ReturnType<typeof setupIntegrationApp>["app"],
  projectId: string,
  status: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await app.request(`/projects/${projectId}`);
    if (response.status === 200) {
      const body = (await response.json()) as { status?: string };
      if (body.status === status) {
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for project status ${status}`);
}

function eventTypesForProject(db: ReturnType<typeof setupIntegrationApp>["db"], projectId: string) {
  return db
    .select({ type: events.type, payload: events.payload })
    .from(events)
    .where(eq(events.project_id, projectId))
    .all();
}

describe.skipIf(!process.env.OC_OPENCODE_INTEGRATION)("golden path — M9.5", () => {
  it("requires workflow LLM key and opencode CLI", () => {
    expect(getOpenAiApiKey()).toBeTruthy();
    expect(isOpencodeAvailable()).toBe(true);
  });

  it("wires real development deps without stub shortcuts", () => {
    const { db, projects, gates, workspace, cleanup } = setupIntegrationApp();
    try {
      const project = projects.createProject("Golden Deps");
      const deps = createDevelopmentDeps(
        { db, projects, gates, workspace, onEvent: () => undefined },
        project.id,
      );
      expect(deps.harness).not.toBe(StubHarness);
      expect(deps.logsPath).toBeTruthy();
    } finally {
      cleanup();
    }
  });

  it("runs requirement to PRD Ready with the real runner", async () => {
    const { app, db, cleanup } = setupIntegrationApp();
    try {
      const created = await app.request("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Golden Requirement" }),
      });
      expect(created.status).toBe(201);
      const project = (await created.json()) as { id: string };

      const result = await runRequirementToPrdReady(app, project.id);
      expect(result.phase).toBe("completed");
      expect(result.projectStatus).toBe("PRD Ready");

      const stored = db
        .select({ status: projects.status })
        .from(projects)
        .where(eq(projects.id, project.id))
        .all()[0];
      expect(stored?.status).toBe("PRD Ready");

      const prd = db
        .select({ content: prdVersions.content })
        .from(prdVersions)
        .where(eq(prdVersions.project_id, project.id))
        .all()[0];
      console.log("\n=== Requirement → PRD Ready ===");
      console.log("project:", project.id);
      console.log("PRD preview:\n", prd?.content?.slice(0, 800) ?? "(none)");
    } finally {
      cleanup();
    }
  }, 300_000);

  it("runs governed development with real OpencodeHarness and authoritative checks", async () => {
    const { app, db, cleanup } = setupIntegrationApp();
    try {
      const projectId = randomUUID();
      seedPrdReady(db, projectId);

      const started = await app.request(`/projects/${projectId}/development/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(started.status).toBe(200);
      const startBody = (await started.json()) as { gateId?: string; gateType?: string };
      expect(startBody.gateId).toBeTruthy();
      expect(startBody.gateType).toBe("tech_plan_confirm");

      await resolveGateWithNested(app, projectId, startBody.gateId!, "approve");
      await waitForSliceAttempt(app, db, projectId, 1_800_000);

      const status = await app.request(`/projects/${projectId}/development/status`);
      const statusBody = (await status.json()) as {
        phase: string;
        projectStatus: string;
        state: { taskQueue: Array<{ testCommand: string }> };
      };
      expect(statusBody.state.taskQueue.length).toBeGreaterThan(0);
      expect(statusBody.state.taskQueue[0]?.testCommand).toBeTruthy();

      const projectEvents = eventTypesForProject(db, projectId);
      const types = projectEvents.map((row) => row.type);
      expect(types).toContain("test.result");
      expect(types.some((type) => type.startsWith("agent."))).toBe(true);

      const payloads = projectEvents.map((row) => row.payload).join("\n");
      expect(payloads).not.toContain("stub-engine-pass");
      expect(payloads).not.toContain("api-default-pass");

      expect(["Developing", "Testing", "Tech Plan Review"]).toContain(statusBody.projectStatus);
      expect(["slicing", "awaiting_gate", "completed", "change_review"]).toContain(
        statusBody.phase,
      );

      const tests = await app.request(`/projects/${projectId}/tests/results`);
      const testsBody = (await tests.json()) as { slice: Array<{ suite: string }> };
      expect(testsBody.slice.length).toBeGreaterThan(0);
      expect(testsBody.slice[0]?.suite.startsWith("slice:")).toBe(true);

      const previewStart = await app.request(`/projects/${projectId}/preview/start`, {
        method: "POST",
      });
      expect(previewStart.status).toBe(200);
      const previewBody = (await previewStart.json()) as {
        url: string;
        health: { reachable: boolean };
      };
      expect(previewBody.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(previewBody.health.reachable).toBe(true);

      const previewStatus = await app.request(`/projects/${projectId}/preview/status`);
      const previewStatusBody = (await previewStatus.json()) as { previewUrl?: string };
      expect(previewStatusBody.previewUrl).toBe(previewBody.url);

      const testRows = db
        .select()
        .from(testResults)
        .all()
        .filter((row) => row.project_id === projectId);
      console.log("\n=== Development + Opencode ===");
      console.log("project:", projectId);
      console.log("phase:", statusBody.phase, "| status:", statusBody.projectStatus);
      console.log(
        "slices:",
        statusBody.state.taskQueue.map((s) => `${s.testCommand?.slice(0, 60)}…`),
      );
      console.log(
        "test results:",
        testRows.map((r) => `${r.suite}: ${r.status}`),
      );
      console.log("preview:", previewBody.url);
      console.log(
        "agent events:",
        types.filter((t) => t.startsWith("agent.")).slice(0, 8),
      );
    } finally {
      cleanup();
    }
  }, 1_800_000);
});

async function waitForSliceAttempt(
  app: ReturnType<typeof setupIntegrationApp>["app"],
  db: ReturnType<typeof setupIntegrationApp>["db"],
  projectId: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await resolveNestedGates(app, projectId, "");

    const projectEvents = eventTypesForProject(db, projectId);
    if (projectEvents.some((row) => row.type === "test.result")) {
      return;
    }

    const open = await listOpenGates(app, projectId);
    if (open.some((gate) => gate.gateType === "slice_failure")) {
      return;
    }

    const status = await app.request(`/projects/${projectId}/development/status`);
    if (status.status === 200) {
      const body = (await status.json()) as {
        phase?: string;
        state?: { taskQueue: Array<{ id: string }> };
      };
      if (body.phase === "completed" || body.phase === "change_review") {
        return;
      }
      if (
        body.state?.taskQueue.length === 0 &&
        body.phase !== "tech_plan" &&
        body.phase !== "awaiting_gate" &&
        body.phase !== "planning"
      ) {
        throw new Error(`Planner produced no slices while phase=${body.phase ?? "unknown"}`);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("Timed out waiting for slice attempt (test.result or slice_failure gate)");
}
