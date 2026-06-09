import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
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

type StepResult = {
  phase?: string;
  projectStatus?: string;
  questions?: string[];
  gateId?: string;
};

async function main(): Promise<void> {
  const { app, db, cleanup } = setupIntegrationApp();
  const startedAt = Date.now();

  try {
    const created = await app.request("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "DeepSeek Requirement E2E" }),
    });
    if (created.status !== 201) {
      throw new Error(`create project failed: ${created.status} ${await created.text()}`);
    }
    const project = (await created.json()) as { id: string };
    console.log(`project ${project.id}`);

    let step = (await (
      await app.request(`/projects/${project.id}/requirement/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirement: REQUIREMENT }),
      })
    ).json()) as StepResult;
    console.log("start", step);

    for (let round = 0; round < 6 && step.phase === "awaiting_answers"; round += 1) {
      const questions = step.questions ?? ["Provide more detail"];
      const answers = questions.map(
        (q, i) =>
          `Answer ${i + 1}: TypeScript CLI todo with JSON file persistence, vitest unit tests, npm bin entry. (${q})`,
      );
      const response = await app.request(`/projects/${project.id}/requirement/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      if (response.status !== 200) {
        throw new Error(`answers round ${round + 1} failed: ${response.status} ${await response.text()}`);
      }
      step = (await response.json()) as StepResult;
      console.log(`answers round ${round + 1}`, step);
    }

    if (step.phase === "awaiting_gate" && step.gateId) {
      const resolved = await app.request(`/gates/${step.gateId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "force_continue" }),
      });
      if (resolved.status !== 200) {
        throw new Error(`gate resolve failed: ${resolved.status} ${await resolved.text()}`);
      }
      console.log("gate resolved", await resolved.json());

      const projectRow = db
        .select({ status: projects.status })
        .from(projects)
        .where(eq(projects.id, project.id))
        .all()[0];
      step = { phase: "completed", projectStatus: projectRow?.status };
      console.log("after gate", step);
    }

    const projectRow = db
      .select({ status: projects.status })
      .from(projects)
      .where(eq(projects.id, project.id))
      .all()[0];
    const prd = db
      .select({ version: prdVersions.version, content: prdVersions.content })
      .from(prdVersions)
      .where(eq(prdVersions.project_id, project.id))
      .all()[0];
    const agentEvents = db
      .select({ type: events.type })
      .from(events)
      .where(eq(events.project_id, project.id))
      .all()
      .filter((row) => row.type.startsWith("agent."));

    console.log("\n=== RESULT ===");
    console.log("elapsedSec", Math.round((Date.now() - startedAt) / 1000));
    console.log("phase", step.phase);
    console.log("projectStatus", projectRow?.status ?? step.projectStatus);
    console.log("prdVersion", prd?.version);
    console.log("prdPreview", prd?.content?.slice(0, 240));
    console.log(
      "agentEvents",
      agentEvents.map((e) => e.type),
    );

    if (projectRow?.status !== "PRD Ready" || !prd?.content) {
      process.exitCode = 1;
      console.error("FAIL: did not reach PRD Ready with PRD artifact");
    } else {
      console.log("PASS: requirement → PRD Ready on real DeepSeek runner");
    }
  } finally {
    cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
