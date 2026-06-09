import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { isOpencodeAvailable } from "@oc/agent-core";
import { events, prdVersions, projects } from "@oc/shared";
import { setupIntegrationApp } from "../src/integration/test-utils.js";

loadEnv({ path: resolve(fileURLToPath(new URL("../../..", import.meta.url)), ".env") });

const REQUIREMENT = [
  "Build a TypeScript CLI todo application for developers.",
  "Users can add a todo, list todos, mark a todo complete, and delete a todo.",
  "Persist todos in a local JSON file under the project workspace.",
  "Use vitest for unit tests covering add/list/complete/delete flows.",
  "Ship as an npm package with a bin entry.",
  "Acceptance: all vitest tests pass under strict TypeScript.",
].join(" ");

type ReqStep = {
  phase?: string;
  projectStatus?: string;
  questions?: string[];
  gateId?: string;
};

type DevStep = {
  phase?: string;
  projectStatus?: string;
  gateId?: string;
  gateType?: string;
  gateOptions?: string[];
  state?: { taskQueue?: Array<{ id: string; testCommand: string }> };
};

async function runRequirement(
  app: ReturnType<typeof setupIntegrationApp>["app"],
  db: ReturnType<typeof setupIntegrationApp>["db"],
  projectId: string,
): Promise<void> {
  let step = (await (
    await app.request(`/projects/${projectId}/requirement/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requirement: REQUIREMENT }),
    })
  ).json()) as ReqStep;
  console.log("requirement start", { phase: step.phase, status: step.projectStatus });

  for (let round = 0; round < 6 && step.phase === "awaiting_answers"; round += 1) {
    const questions = step.questions ?? ["Provide more detail"];
    const answers = questions.map(
      (q, i) =>
        `Use bin name 'todo', subcommands (todo add/list/complete/delete), UUID ids, auto-create todos.json, numbered list output, vitest tests for CRUD. (${i + 1}: ${q})`,
    );
    const response = await app.request(`/projects/${projectId}/requirement/answers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });
    if (response.status !== 200) {
      throw new Error(`requirement answers failed: ${response.status} ${await response.text()}`);
    }
    step = (await response.json()) as ReqStep;
    console.log(`requirement answers ${round + 1}`, { phase: step.phase, status: step.projectStatus });
  }

  if (step.phase === "awaiting_gate" && step.gateId) {
    const resolved = await app.request(`/gates/${step.gateId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "force_continue" }),
    });
    if (resolved.status !== 200) {
      throw new Error(`requirement gate failed: ${resolved.status} ${await resolved.text()}`);
    }
    console.log("requirement gate force_continue");
  }

  const row = db
    .select({ status: projects.status })
    .from(projects)
    .where(eq(projects.id, projectId))
    .all()[0];
  if (row?.status !== "PRD Ready") {
    throw new Error(`expected PRD Ready, got ${row?.status ?? "unknown"}`);
  }
  console.log("requirement done → PRD Ready");
}

type OpenGate = { id: string; gateType: string; status: string };

async function listOpenGates(
  app: ReturnType<typeof setupIntegrationApp>["app"],
  projectId: string,
): Promise<OpenGate[]> {
  const response = await app.request(`/projects/${projectId}/gates`);
  if (response.status !== 200) {
    return [];
  }
  const body = (await response.json()) as { gates?: OpenGate[] };
  return (body.gates ?? []).filter((gate) => gate.status === "open");
}

async function resolveNestedGates(
  app: ReturnType<typeof setupIntegrationApp>["app"],
  projectId: string,
  primaryGateId: string,
): Promise<void> {
  const open = await listOpenGates(app, projectId);
  for (const gate of open) {
    if (gate.id === primaryGateId) {
      continue;
    }
    const decision =
      gate.gateType === "dangerous_operation" || gate.gateType === "deployment"
        ? "approve"
        : gate.gateType === "slice_failure"
          ? "retry"
          : "force_continue";
    const resolved = await app.request(`/gates/${gate.id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    if (resolved.status === 200) {
      console.log(`nested gate ${gate.id} (${gate.gateType}) → ${decision}`);
    }
  }
}

async function resolveGate(
  app: ReturnType<typeof setupIntegrationApp>["app"],
  projectId: string,
  gateId: string,
  decision: string,
  options: { autoApproveNested?: boolean } = {},
): Promise<void> {
  const autoApprove = options.autoApproveNested ?? false;
  let poller: ReturnType<typeof setInterval> | undefined;

  if (autoApprove) {
    poller = setInterval(() => {
      void resolveNestedGates(app, projectId, gateId);
    }, 400);
  }

  try {
    const resolved = await app.request(`/gates/${gateId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    if (resolved.status !== 200) {
      throw new Error(`gate ${gateId} resolve failed: ${resolved.status} ${await resolved.text()}`);
    }
    console.log(`gate ${gateId} → ${decision}`);
  } finally {
    if (poller) {
      clearInterval(poller);
    }
  }
}

async function runDevelopment(
  app: ReturnType<typeof setupIntegrationApp>["app"],
  projectId: string,
): Promise<DevStep> {
  const started = await app.request(`/projects/${projectId}/development/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (started.status !== 200) {
    throw new Error(`development start failed: ${started.status} ${await started.text()}`);
  }
  let step = (await started.json()) as DevStep;
  console.log("development start", {
    phase: step.phase,
    status: step.projectStatus,
    gateType: step.gateType,
    gateId: step.gateId,
  });

  if (step.phase === "awaiting_gate" && step.gateId && step.gateType === "tech_plan_confirm") {
    await resolveGate(app, projectId, step.gateId, "approve", { autoApproveNested: true });
    const status = await app.request(`/projects/${projectId}/development/status`);
    step = (await status.json()) as DevStep;
    console.log("after tech_plan approve", {
      phase: step.phase,
      status: step.projectStatus,
      slices: step.state?.taskQueue?.length,
      firstTest: step.state?.taskQueue?.[0]?.testCommand,
    });
  }

  for (let attempt = 0; attempt < 3 && step.phase === "awaiting_gate"; attempt += 1) {
    if (step.gateType === "slice_failure" && step.gateId) {
      await resolveGate(app, projectId, step.gateId, "retry", { autoApproveNested: true });
      const status = await app.request(`/projects/${projectId}/development/status`);
      step = (await status.json()) as DevStep;
      console.log(`after slice_failure retry ${attempt + 1}`, {
        phase: step.phase,
        status: step.projectStatus,
      });
    } else {
      break;
    }
  }

  return step;
}

async function main(): Promise<void> {
  if (!isOpencodeAvailable()) {
    throw new Error("opencode CLI is required for development E2E");
  }
  if (!process.env.OC_LLM_API_KEY && !process.env.OPENAI_API_KEY) {
    throw new Error("OC_LLM_API_KEY or OPENAI_API_KEY required for workflow agents");
  }

  const { app, db, cleanup } = setupIntegrationApp();
  const startedAt = Date.now();

  try {
    const created = await app.request("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Golden Path E2E" }),
    });
    if (created.status !== 201) {
      throw new Error(`create project failed: ${created.status}`);
    }
    const project = (await created.json()) as { id: string };
    console.log(`\n=== project ${project.id} ===\n`);

    await runRequirement(app, db, project.id);

    const dev = await runDevelopment(app, project.id);

    const projectRow = db
      .select({ status: projects.status })
      .from(projects)
      .where(eq(projects.id, project.id))
      .all()[0];
    const prd = db
      .select({ version: prdVersions.version })
      .from(prdVersions)
      .where(eq(prdVersions.project_id, project.id))
      .all()[0];
    const rows = db
      .select({ type: events.type, payload: events.payload })
      .from(events)
      .where(eq(events.project_id, project.id))
      .all();
    const types = rows.map((r) => r.type);
    const payloads = rows.map((r) => r.payload).join("\n");

    console.log("\n=== RESULT ===");
    console.log("elapsedSec", Math.round((Date.now() - startedAt) / 1000));
    console.log("projectStatus", projectRow?.status);
    console.log("devPhase", dev.phase);
    console.log("prdVersion", prd?.version);
    console.log("hasTestResult", types.includes("test.result"));
    console.log("hasToolCall", types.some((t) => t.startsWith("tool_call.")));
    console.log("agentEventCount", types.filter((t) => t.startsWith("agent.")).length);
    console.log("stubLeak", payloads.includes("stub-engine-pass") || payloads.includes("api-default-pass"));

    const ok =
      projectRow?.status &&
      ["Developing", "Testing", "Tech Plan Review"].includes(projectRow.status) &&
      types.includes("test.result") &&
      types.some((t) => t.startsWith("agent.")) &&
      !payloads.includes("stub-engine-pass") &&
      !payloads.includes("api-default-pass") &&
      (dev.state?.taskQueue?.length ?? 0) > 0;

    if (ok) {
      console.log("PASS: requirement → PRD → governed development with real opencode + authoritative test");
    } else {
      process.exitCode = 1;
      console.error("FAIL: development golden-path criteria not met");
      console.error({ devPhase: dev.phase, status: projectRow?.status, types: [...new Set(types)] });
    }
  } finally {
    cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
