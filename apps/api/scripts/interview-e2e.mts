/**
 * AI 面试助手端到端演示：统一考试输入 → 需求澄清 → PRD → 开发切片 → 测试。
 * 与 golden-path-e2e 不同：产物写入仓库根下的 demo-runs/，跑完不删除，
 * 便于事后独立启动 generated app 验证主路径。
 *
 * 运行：cd apps/api && npx tsx scripts/interview-e2e.mts
 */
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { eq } from "drizzle-orm";
import { isOpencodeAvailable } from "@oc/agent-core";
import { createDb, events, prdVersions, projects } from "@oc/shared";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
loadEnv({ path: path.join(REPO_ROOT, ".env") });

const RUN_DIR = path.join(
  REPO_ROOT,
  "demo-runs",
  `interview-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`,
);

const REQUIREMENT =
  "设计一个 AI 面试助手。HR 可以创建岗位，上传或粘贴候选人简历，系统根据岗位要求生成面试问题，记录面试评价，并给出候选人匹配度建议。";

const DOMAIN_ANSWERS: Record<string, string> = {
  default:
    "Web 应用，单 HR 用户即可（无需登录）。岗位含名称/职责/要求三个字段。简历以粘贴文本为主。" +
    "面试问题至少生成 5 个，基于岗位要求与简历内容。评价支持文字+1-5分。" +
    "匹配度为 0-100 分并附理由。技术栈 TypeScript + 任意轻量 Web 框架，数据存本地 JSON 即可，vitest 做单测。",
};

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

type AppLike = {
  request: (input: string, init?: RequestInit) => Promise<Response>;
};

function log(label: string, data?: unknown): void {
  const ts = new Date().toISOString().slice(11, 19);
  if (data !== undefined) {
    console.log(`[${ts}] ${label}`, typeof data === "string" ? data : JSON.stringify(data));
  } else {
    console.log(`[${ts}] ${label}`);
  }
}

async function postJson(app: AppLike, url: string, body: unknown): Promise<Response> {
  return app.request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function listOpenGates(app: AppLike, projectId: string) {
  const response = await app.request(`/projects/${projectId}/gates`);
  if (response.status !== 200) {
    return [] as Array<{ id: string; gateType: string; status: string }>;
  }
  const body = (await response.json()) as {
    gates?: Array<{ id: string; gateType: string; status: string }>;
  };
  return (body.gates ?? []).filter((gate) => gate.status === "open");
}

async function resolveNestedGates(app: AppLike, projectId: string, skipGateId: string) {
  for (const gate of await listOpenGates(app, projectId)) {
    if (gate.id === skipGateId) continue;
    const decision =
      gate.gateType === "dangerous_operation" || gate.gateType === "deployment"
        ? "approve"
        : gate.gateType === "slice_failure"
          ? "retry"
          : "force_continue";
    const resolved = await postJson(app, `/gates/${gate.id}/resolve`, { decision });
    if (resolved.status === 200) {
      log(`nested gate ${gate.gateType} → ${decision}`);
    }
  }
}

async function resolveGate(
  app: AppLike,
  projectId: string,
  gateId: string,
  decision: string,
): Promise<void> {
  const poller = setInterval(() => {
    void resolveNestedGates(app, projectId, gateId);
  }, 500);
  try {
    const resolved = await postJson(app, `/gates/${gateId}/resolve`, { decision });
    if (resolved.status !== 200) {
      throw new Error(`gate ${gateId} resolve failed: ${resolved.status} ${await resolved.text()}`);
    }
    log(`gate → ${decision}`);
  } finally {
    clearInterval(poller);
  }
}

async function main(): Promise<void> {
  if (!isOpencodeAvailable()) {
    throw new Error("opencode CLI is required");
  }
  if (!process.env.OC_LLM_API_KEY && !process.env.OPENAI_API_KEY) {
    throw new Error("OC_LLM_API_KEY or OPENAI_API_KEY required");
  }

  mkdirSync(RUN_DIR, { recursive: true });
  const dbPath = path.join(RUN_DIR, "app.sqlite");
  const generatedProjectsRoot = path.join(RUN_DIR, "generated-projects");
  process.env.OC_TEST_DB_PATH = dbPath;
  process.env.OC_GENERATED_PROJECTS_ROOT = generatedProjectsRoot;
  delete process.env.OC_USE_STUB_ENGINE;
  process.env.OC_OPENCODE_SLICE_TIMEOUT_MS ??= "900000";

  execSync("pnpm exec drizzle-kit push", {
    cwd: path.join(REPO_ROOT, "packages/shared"),
    env: { ...process.env, OC_TEST_DB_PATH: dbPath },
    stdio: "pipe",
  });

  const { createApp } = await import("../src/app.js");
  const { resetBroadcasts } = await import("../src/events/broadcast.js");
  resetBroadcasts();
  const db = createDb(dbPath);
  const { app } = createApp({ db, generatedProjectsRoot });

  log("run dir", RUN_DIR);

  const created = await postJson(app, "/projects", { name: "AI 面试助手 Demo" });
  if (created.status !== 201) {
    throw new Error(`create project failed: ${created.status}`);
  }
  const project = (await created.json()) as { id: string };
  log("project", project.id);

  // ---- Requirement phase ----
  let step = (await (
    await postJson(app, `/projects/${project.id}/requirement/start`, {
      requirement: REQUIREMENT,
    })
  ).json()) as ReqStep;
  log("requirement start", { phase: step.phase, status: step.projectStatus });

  let totalQuestions = 0;
  for (let round = 0; round < 8 && step.phase === "awaiting_answers"; round += 1) {
    const questions = step.questions ?? [];
    totalQuestions += questions.length;
    const answers = questions.map((q) => `${DOMAIN_ANSWERS.default}（针对：${q}）`);
    const response = await postJson(app, `/projects/${project.id}/requirement/answers`, {
      answers,
    });
    if (response.status !== 200) {
      throw new Error(`answers failed: ${response.status} ${await response.text()}`);
    }
    step = (await response.json()) as ReqStep;
    log(`answers round ${round + 1}`, {
      phase: step.phase,
      questions: questions.length,
      totalQuestions,
    });
  }

  // Stuck gate (if any) → force_continue, then the requirement_confirm gate → approve.
  for (let i = 0; i < 4; i += 1) {
    const open = await listOpenGates(app, project.id);
    const gate = open.find(
      (g) => g.gateType === "requirement_stuck" || g.gateType === "requirement_confirm",
    );
    if (!gate) break;
    const decision = gate.gateType === "requirement_confirm" ? "approve" : "force_continue";
    await resolveGate(app, project.id, gate.id, decision);
  }

  const afterReq = db
    .select({ status: projects.status })
    .from(projects)
    .where(eq(projects.id, project.id))
    .all()[0];
  log("requirement done", { status: afterReq?.status, totalQuestions });
  if (afterReq?.status !== "PRD Ready") {
    throw new Error(`expected PRD Ready, got ${afterReq?.status}`);
  }

  // ---- Development phase ----
  const started = await postJson(app, `/projects/${project.id}/development/start`, {});
  if (started.status !== 200) {
    throw new Error(`development start failed: ${started.status} ${await started.text()}`);
  }
  let dev = (await started.json()) as DevStep;
  log("development start", { phase: dev.phase, gateType: dev.gateType });

  if (dev.phase === "awaiting_gate" && dev.gateId && dev.gateType === "tech_plan_confirm") {
    await resolveGate(app, project.id, dev.gateId, "approve");
    const status = await app.request(`/projects/${project.id}/development/status`);
    dev = (await status.json()) as DevStep;
    log("after tech_plan approve", {
      phase: dev.phase,
      status: dev.projectStatus,
      slices: dev.state?.taskQueue?.length,
    });
  }

  for (let attempt = 0; attempt < 6 && dev.phase === "awaiting_gate"; attempt += 1) {
    if (dev.gateType === "slice_failure" && dev.gateId) {
      await resolveGate(app, project.id, dev.gateId, "retry");
      const status = await app.request(`/projects/${project.id}/development/status`);
      dev = (await status.json()) as DevStep;
      log(`after slice retry ${attempt + 1}`, { phase: dev.phase, status: dev.projectStatus });
    } else {
      log("unexpected gate, stopping retries", { gateType: dev.gateType });
      break;
    }
  }

  // ---- Testing phase (best effort) ----
  if (dev.phase === "completed" || dev.projectStatus === "Testing") {
    log("starting testing phase");
    const testing = await postJson(app, `/projects/${project.id}/testing/start`, {});
    log("testing start", { status: testing.status });
    if (testing.status === 200) {
      const body = (await testing.json()) as Record<string, unknown>;
      log("testing result", body);
    } else {
      log("testing failed (non-fatal)", await testing.text());
    }
  }

  // ---- Summary ----
  const finalRow = db
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
    .select({ type: events.type })
    .from(events)
    .where(eq(events.project_id, project.id))
    .all();
  const types = rows.map((r) => r.type);

  console.log("\n=== INTERVIEW E2E RESULT ===");
  console.log("runDir", RUN_DIR);
  console.log("projectId", project.id);
  console.log("projectStatus", finalRow?.status);
  console.log("devPhase", dev.phase);
  console.log("prdVersion", prd?.version);
  console.log("totalQuestions", totalQuestions);
  console.log("hasTestResult", types.includes("test.result"));
  console.log("toolCallEvents", types.filter((t) => t.startsWith("tool_call.")).length);
  console.log("agentEvents", types.filter((t) => t.startsWith("agent.")).length);
  console.log("\ngenerated app:", path.join(generatedProjectsRoot));
  console.log("INTERVIEW_E2E_DONE");
}

main().catch((error) => {
  console.error("INTERVIEW_E2E_FAILED", error);
  process.exit(1);
});
