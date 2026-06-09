import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  StubHarness,
  isOpencodeAvailable,
} from "@oc/agent-core";
import {
  acceptanceCriteriaVersions,
  events,
  prdVersions,
  projects,
} from "@oc/shared";
import { createDevelopmentDeps } from "../development/deps.js";
import { setupIntegrationApp } from "./test-utils.js";

const COMPLETE_REQUIREMENT = [
  "Build a TypeScript CLI todo application for developers.",
  "Users can add a todo, list todos, mark a todo complete, and delete a todo.",
  "Persist todos in a local JSON file under the project workspace.",
  "Use vitest for unit tests covering add/list/complete/delete flows.",
  "Ship as an npm package with a bin entry.",
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
      content: "# PRD\n\nCLI todo app with vitest coverage.",
      created_at: now,
    })
    .run();
  db.insert(acceptanceCriteriaVersions)
    .values({
      id: randomUUID(),
      project_id: projectId,
      version: "ac-1",
      content: "- Users can add, list, complete, and delete todos\n- vitest suite passes",
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
        `Round ${round + 1} answer ${index + 1} for "${question}": TypeScript CLI todo with vitest and JSON persistence.`,
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
    result = (await resolved.json()) as RequirementResult;
  }

  return result;
}

function eventTypesForProject(db: ReturnType<typeof setupIntegrationApp>["db"], projectId: string) {
  return db
    .select({ type: events.type, payload: events.payload })
    .from(events)
    .where(eq(events.project_id, projectId))
    .all();
}

describe.skipIf(!process.env.OC_OPENCODE_INTEGRATION)("golden path — M9.5", () => {
  it("requires OpenAI key and opencode CLI", () => {
    expect(process.env.OPENAI_API_KEY ?? process.env.OC_OPENAI_API_KEY).toBeTruthy();
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

      const resolved = await app.request(`/gates/${startBody.gateId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approve" }),
      });
      expect(resolved.status).toBe(200);

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
    } finally {
      cleanup();
    }
  }, 600_000);
});
