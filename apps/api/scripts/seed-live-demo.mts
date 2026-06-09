/**
 * Seeds the persistent dev API (localhost:3001) with requirement + development progress.
 * Run while `pnpm --filter @oc/api dev` is up.
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

loadEnv({ path: resolve(fileURLToPath(new URL("../../..", import.meta.url)), ".env") });

const API = process.env.API_BASE ?? "http://localhost:3001";

const REQUIREMENT = [
  "Build a TypeScript CLI todo application for developers.",
  "Users can add a todo, list todos, mark a todo complete, and delete a todo.",
  "Persist todos in a local JSON file under the project workspace.",
  "Use vitest for unit tests covering add/list/complete/delete flows.",
  "Ship as an npm package with a bin entry.",
].join(" ");

type Json = Record<string, unknown>;

async function api(path: string, init?: RequestInit): Promise<Json> {
  const response = await fetch(`${API}${path}`, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} → ${response.status}: ${text}`);
  }
  return text ? (JSON.parse(text) as Json) : {};
}

async function listOpenGates(projectId: string): Promise<Array<{ id: string; gateType: string }>> {
  const body = await api(`/projects/${projectId}/gates`);
  const gates = (body.gates as Array<{ id: string; gateType: string; status: string }>) ?? [];
  return gates.filter((g) => g.status === "open");
}

async function resolveNestedGates(projectId: string, primaryGateId: string): Promise<void> {
  const open = await listOpenGates(projectId);
  for (const gate of open) {
    if (gate.id === primaryGateId) continue;
    const decision =
      gate.gateType === "dangerous_operation" || gate.gateType === "deployment"
        ? "approve"
        : gate.gateType === "slice_failure"
          ? "retry"
          : "force_continue";
    try {
      await api(`/gates/${gate.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      console.log(`nested gate ${gate.gateType} → ${decision}`);
    } catch {
      // ignore races while primary resolve is in flight
    }
  }
}

async function resolveGate(
  projectId: string,
  gateId: string,
  decision: string,
  autoNested = false,
): Promise<void> {
  const poller = autoNested
    ? setInterval(() => {
        void resolveNestedGates(projectId, gateId);
      }, 400)
    : undefined;
  try {
    await api(`/gates/${gateId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    console.log(`gate ${gateId} → ${decision}`);
  } finally {
    if (poller) clearInterval(poller);
  }
}

async function main(): Promise<void> {
  const project = (await api("/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Live Demo — CLI Todo" }),
  })) as { id: string };
  console.log("projectId", project.id);

  let step = await api(`/projects/${project.id}/requirement/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requirement: REQUIREMENT }),
  });
  console.log("requirement", step.phase, step.projectStatus);

  for (let round = 0; round < 6 && step.phase === "awaiting_answers"; round += 1) {
    const questions = (step.questions as string[]) ?? ["more detail"];
    const answers = questions.map(
      (q, i) => `bin todo, subcommands, UUID ids, vitest CRUD tests. (${i + 1}: ${q})`,
    );
    step = await api(`/projects/${project.id}/requirement/answers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });
    console.log(`answers ${round + 1}`, step.phase, step.projectStatus);
  }

  if (step.phase === "awaiting_gate" && step.gateId) {
    await resolveGate(project.id, step.gateId as string, "force_continue");
  }

  step = await api(`/projects/${project.id}/development/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  console.log("development", step.phase, step.projectStatus, step.gateType);

  if (step.phase === "awaiting_gate" && step.gateType === "tech_plan_confirm" && step.gateId) {
    await resolveGate(project.id, step.gateId as string, "approve", true);
    step = await api(`/projects/${project.id}/development/status`);
    console.log("after tech_plan", step.phase, step.projectStatus);
  }

  console.log("\nOPEN", `http://localhost:3000/projects/${project.id}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
