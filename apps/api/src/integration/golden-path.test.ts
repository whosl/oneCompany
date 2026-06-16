import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  StubHarness,
  getOpenAiApiKey,
  isOpencodeAvailable,
} from "@oc/agent-core";
import {
  DELIVERY_REPORT_SECTION_IDS,
  acceptanceCriteriaVersions,
  deployments,
  events,
  humanGates,
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
  gateType?: string;
};

async function findOpenGate(
  app: ReturnType<typeof setupIntegrationApp>["app"],
  projectId: string,
  gateType: string,
): Promise<{ id: string; gateType: string } | undefined> {
  return (await listOpenGates(app, projectId)).find((gate) => gate.gateType === gateType);
}

async function refreshRequirementResult(
  app: ReturnType<typeof setupIntegrationApp>["app"],
  projectId: string,
): Promise<RequirementResult> {
  const confirmGate = await findOpenGate(app, projectId, "requirement_confirm");
  if (confirmGate) {
    return {
      phase: "awaiting_gate",
      projectStatus: "PRD Ready",
      gateId: confirmGate.id,
      gateType: "requirement_confirm",
    };
  }

  const stuckGate = await findOpenGate(app, projectId, "requirement_stuck");
  if (stuckGate) {
    return {
      phase: "awaiting_gate",
      projectStatus: "PRD Ready",
      gateId: stuckGate.id,
      gateType: "requirement_stuck",
    };
  }

  const project = await app.request(`/projects/${projectId}`);
  const body = (await project.json()) as { status?: string };
  return { phase: "completed", projectStatus: body.status ?? "PRD Ready" };
}

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

  for (let round = 0; round < 3 && result.phase === "awaiting_gate" && result.gateId; round += 1) {
    const gateType =
      result.gateType ??
      (await listOpenGates(app, projectId)).find((gate) => gate.id === result.gateId)?.gateType;
    if (gateType === "requirement_confirm") {
      break;
    }
    if (gateType === "requirement_stuck") {
      await resolveGateWithNested(app, projectId, result.gateId, "force_continue");
      await waitForProjectStatus(app, projectId, "PRD Ready", 120_000);
      result = await refreshRequirementResult(app, projectId);
      continue;
    }
    break;
  }

  return result;
}

async function approveRequirementConfirm(
  app: ReturnType<typeof setupIntegrationApp>["app"],
  projectId: string,
  gateId: string,
): Promise<void> {
  await resolveGateWithNested(app, projectId, gateId, "approve");
  await waitForProjectStatus(app, projectId, "PRD Ready", 60_000);
}

async function listOpenGates(
  app: ReturnType<typeof setupIntegrationApp>["app"],
  projectId: string,
): Promise<Array<{ id: string; gateType: string; status: string }>> {
  const response = await app.request(`/projects/${projectId}/gates`);
  const body = (await response.json()) as { gates?: Array<{ id: string; gateType: string; status: string }> };
  return (body.gates ?? []).filter((gate) => gate.status === "open");
}

function nestedGateDecision(gateType: string): string | undefined {
  if (gateType === "dangerous_operation" || gateType === "deployment") {
    return "approve";
  }
  if (gateType === "slice_failure") {
    return "retry";
  }
  if (gateType === "change_review") {
    return "update_plan";
  }
  if (gateType === "requirement_stuck") {
    return "force_continue";
  }
  return undefined;
}

async function resolveNestedGates(
  app: ReturnType<typeof setupIntegrationApp>["app"],
  projectId: string,
  primaryGateId: string,
): Promise<void> {
  for (const gate of await listOpenGates(app, projectId)) {
    if (gate.id === primaryGateId) continue;
    const decision = nestedGateDecision(gate.gateType);
    if (!decision) continue;
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

function resolvedGateTypesForProject(
  db: ReturnType<typeof setupIntegrationApp>["db"],
  projectId: string,
): string[] {
  return db
    .select({ gateType: humanGates.gate_type, status: humanGates.status })
    .from(humanGates)
    .where(eq(humanGates.project_id, projectId))
    .all()
    .filter((row) => row.status === "resolved")
    .map((row) => row.gateType);
}

function assertHumanGateResolvedEvents(
  db: ReturnType<typeof setupIntegrationApp>["db"],
  projectId: string,
  gateTypes: string[],
): void {
  const resolvedEvents = eventTypesForProject(db, projectId).filter(
    (row) => row.type === "human_gate.resolved",
  );
  expect(resolvedEvents.length).toBeGreaterThanOrEqual(gateTypes.length);
  for (const gateType of gateTypes) {
    expect(resolvedGateTypesForProject(db, projectId)).toContain(gateType);
  }
}

function assertDeliveredArtifacts(generatedProjectsRoot: string, slug: string): void {
  const projectRoot = path.join(generatedProjectsRoot, slug);
  const reportPath = path.join(projectRoot, "artifacts", "delivery-report.md");
  expect(fs.existsSync(reportPath)).toBe(true);

  const reportMarkdown = fs.readFileSync(reportPath, "utf8");
  for (const sectionId of DELIVERY_REPORT_SECTION_IDS) {
    const title = deliveryReportSectionTitle(sectionId);
    expect(reportMarkdown).toContain(`## ${title}`);
  }

  const repoPath = path.join(projectRoot, "repo");
  expect(fs.existsSync(path.join(repoPath, "Dockerfile"))).toBe(true);
  expect(fs.existsSync(path.join(repoPath, "docker-compose.yml"))).toBe(true);
  expect(fs.existsSync(path.join(repoPath, "RUN.md"))).toBe(true);
}

function deliveryReportSectionTitle(sectionId: (typeof DELIVERY_REPORT_SECTION_IDS)[number]): string {
  switch (sectionId) {
    case "requirement-summary":
      return "Requirement Summary";
    case "confirmed-tech-stack":
      return "Confirmed Tech Stack";
    case "feature-list":
      return "Feature List";
    case "directory-structure":
      return "Directory Structure";
    case "run-instructions":
      return "Run Instructions";
    case "test-results":
      return "Test Results";
    case "deployment-url":
      return "Deployment URL";
    case "risks-and-limitations":
      return "Risks and Limitations";
    case "follow-up-recommendations":
      return "Follow-up Recommendations";
  }
}

function dumpGoldenPathSummary(input: {
  label: string;
  projectId: string;
  status: string;
  eventTypes: string[];
  resolvedGates: string[];
  deploymentUrl?: string | null;
  reportPath?: string;
}): void {
  console.log(`\n=== ${input.label} ===`);
  console.log("project:", input.projectId);
  console.log("status:", input.status);
  console.log("deployment:", input.deploymentUrl ?? "(none)");
  console.log("report:", input.reportPath ?? "(none)");
  console.log("resolved gates:", input.resolvedGates.join(", ") || "(none)");
  console.log(
    "events:",
    [...new Set(input.eventTypes)].sort().join(", "),
  );
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
      expect(result.projectStatus).toBe("PRD Ready");
      expect(result.phase).toBe("awaiting_gate");
      expect(result.gateType ?? (await findOpenGate(app, project.id, "requirement_confirm"))?.gateType).toBe(
        "requirement_confirm",
      );

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
      expect(previewBody.url).toBe(`/preview/${encodeURIComponent(projectId)}/`);
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

  it("runs one sentence through delivery to Delivered with artifacts and gate events", async () => {
    const { app, db, generatedProjectsRoot, cleanup } = setupIntegrationApp();
    try {
      const created = await app.request("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Golden Path Delivered" }),
      });
      expect(created.status).toBe(201);
      const project = (await created.json()) as { id: string; slug: string };

      const requirement = await runRequirementToPrdReady(app, project.id);
      expect(requirement.projectStatus).toBe("PRD Ready");
      const openGates = await listOpenGates(app, project.id);
      const requirementGate =
        openGates.find((gate) => gate.gateType === "requirement_confirm") ??
        openGates.find((gate) => gate.id === requirement.gateId);
      expect(requirementGate?.gateType).toBe("requirement_confirm");
      await approveRequirementConfirm(app, project.id, requirementGate!.id);

      const development = await app.request(`/projects/${project.id}/development/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(development.status).toBe(200);
      const developmentBody = (await development.json()) as { gateId?: string; gateType?: string };
      expect(developmentBody.gateType).toBe("tech_plan_confirm");
      await resolveGateWithNested(app, project.id, developmentBody.gateId!, "approve");
      await waitForDevelopmentComplete(app, db, project.id, 2_400_000);

      const testing = await app.request(`/projects/${project.id}/testing/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestDeploy: true }),
      });
      expect(testing.status).toBe(200);
      const testingBody = (await testing.json()) as { projectStatus?: string; phase?: string };
      expect(testingBody.projectStatus).toBe("Deploying");

      const deploymentGate = await findOpenGate(app, project.id, "deployment");
      expect(deploymentGate).toBeTruthy();

      const deploymentUrl = "https://golden-path.trycloudflare.com";
      const urlSubmit = await app.request(`/projects/${project.id}/deployment/url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: deploymentUrl }),
      });
      expect(urlSubmit.status).toBe(200);

      await resolveGateWithNested(app, project.id, deploymentGate!.id, "approve");
      await waitForProjectStatus(app, project.id, "Awaiting Acceptance", 120_000);

      const deploymentRow = db
        .select()
        .from(deployments)
        .where(eq(deployments.project_id, project.id))
        .all()[0];
      expect(deploymentRow?.url).toBe(deploymentUrl);

      const finalGate = await findOpenGate(app, project.id, "final_acceptance");
      expect(finalGate).toBeTruthy();

      const report = await app.request(`/projects/${project.id}/report`);
      expect(report.status).toBe(200);
      const reportBody = (await report.json()) as {
        sections: Array<{ id: string; content: string | null }>;
      };
      const deliverySection = reportBody.sections.find((section) => section.id === "delivery-report");
      expect(deliverySection?.content).toBeTruthy();

      await resolveGateWithNested(app, project.id, finalGate!.id, "accept");
      await waitForProjectStatus(app, project.id, "Delivered", 60_000);

      const stored = db
        .select({ status: projects.status, slug: projects.slug })
        .from(projects)
        .where(eq(projects.id, project.id))
        .all()[0];
      expect(stored?.status).toBe("Delivered");

      assertDeliveredArtifacts(generatedProjectsRoot, stored!.slug!);
      assertHumanGateResolvedEvents(db, project.id, [
        "requirement_confirm",
        "tech_plan_confirm",
        "deployment",
        "final_acceptance",
      ]);

      const projectEvents = eventTypesForProject(db, project.id);
      dumpGoldenPathSummary({
        label: "Golden Path → Delivered",
        projectId: project.id,
        status: stored!.status!,
        eventTypes: projectEvents.map((row) => row.type),
        resolvedGates: resolvedGateTypesForProject(db, project.id),
        deploymentUrl: deploymentRow?.url,
        reportPath: path.join(generatedProjectsRoot, stored!.slug!, "artifacts", "delivery-report.md"),
      });
    } finally {
      cleanup();
    }
  }, 3_600_000);
});

async function waitForDevelopmentComplete(
  app: ReturnType<typeof setupIntegrationApp>["app"],
  db: ReturnType<typeof setupIntegrationApp>["db"],
  projectId: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await resolveNestedGates(app, projectId, "");

    const response = await app.request(`/projects/${projectId}`);
    if (response.status === 200) {
      const body = (await response.json()) as { status?: string };
      if (body.status === "Testing") {
        return;
      }
      if (body.status === "Failed") {
        throw new Error("Development failed before reaching Testing");
      }
    }

    const open = await listOpenGates(app, projectId);
    for (const gate of open) {
      const decision = nestedGateDecision(gate.gateType);
      if (!decision) continue;
      await app.request(`/gates/${gate.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
    }

    const projectEvents = eventTypesForProject(db, projectId);
    if (projectEvents.some((row) => row.type === "run.failed")) {
      const failures = projectEvents
        .filter((row) => row.type === "run.failed")
        .map((row) => row.payload)
        .join("\n");
      throw new Error(`Development run failed:\n${failures}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("Timed out waiting for Testing status");
}

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
