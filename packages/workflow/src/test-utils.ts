import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import {
  registerRequirementAgents,
  runAgent,
  runScriptedRequirementAgent,
  type RequirementAgentTask,
} from "@oc/agent-core";
import {
  assertTransition,
  createDb,
  emit,
  getAllowedOptions,
  humanGates,
  parseProjectStatus,
  projectStatusHistory,
  projects,
  serializeGatePayload,
  type Db,
  type EventEnvelope,
  type ProjectStatus,
} from "@oc/shared";
import type { RequirementWorkflowDeps } from "./requirement/types.js";

export function setupTestDb(): { db: Db; cleanup: () => void } {
  const tempDir = mkdtempSync(path.join(tmpdir(), "oc-workflow-test-"));
  const dbPath = path.join(tempDir, "app.sqlite");
  process.env.OC_TEST_DB_PATH = dbPath;

  execSync("pnpm exec drizzle-kit push", {
    cwd: path.resolve(process.cwd(), "../shared"),
    env: { ...process.env, OC_TEST_DB_PATH: dbPath },
    stdio: "pipe",
  });

  return {
    db: createDb(dbPath),
    cleanup: () => {
      delete process.env.OC_TEST_DB_PATH;
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

export function seedProject(db: Db, name = "M3 Workflow Project"): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.insert(projects)
    .values({
      id,
      name,
      slug: `m3-${id.slice(0, 8)}`,
      status: "Draft Requirement",
      created_at: now,
      updated_at: now,
    })
    .run();
  return id;
}

function getProjectStatus(db: Db, projectId: string): ProjectStatus {
  const row = db.select().from(projects).where(eq(projects.id, projectId)).all()[0];
  if (!row) {
    throw new Error(`Project not found: ${projectId}`);
  }
  return parseProjectStatus(row.status);
}

function setProjectStatus(
  db: Db,
  projectId: string,
  nextStatus: ProjectStatus,
  trigger: string,
  onEvent?: (envelope: EventEnvelope) => void,
): void {
  const current = getProjectStatus(db, projectId);
  assertTransition(current, nextStatus);
  const now = new Date().toISOString();
  db.update(projects)
    .set({ status: nextStatus, updated_at: now })
    .where(eq(projects.id, projectId))
    .run();
  db.insert(projectStatusHistory)
    .values({
      id: randomUUID(),
      project_id: projectId,
      from_status: current,
      to_status: nextStatus,
      trigger,
      created_at: now,
    })
    .run();
  const envelope = emit(db, {
    projectId,
    payload: { type: "project.status_changed", projectId, status: nextStatus },
  });
  onEvent?.(envelope);
}

function createGate(
  db: Db,
  projectId: string,
  gateType: string,
  onEvent?: (envelope: EventEnvelope) => void,
): { id: string } {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.insert(humanGates)
    .values({
      id,
      project_id: projectId,
      gate_type: gateType,
      status: "open",
      options: serializeGatePayload([...getAllowedOptions(gateType)]),
      decision: null,
      created_at: now,
      resolved_at: null,
    })
    .run();
  const envelope = emit(db, {
    projectId,
    payload: { type: "human_gate.created", projectId, gateId: id, gateType },
  });
  onEvent?.(envelope);
  return { id };
}

export function createWorkflowDeps(db: Db): RequirementWorkflowDeps {
  return {
    db,
    runAgent: async (input) =>
      runAgent(
        {
          db,
          runner: async (agentIdAtVersion, task) => ({
            output: runScriptedRequirementAgent(
              agentIdAtVersion,
              task as RequirementAgentTask,
            ),
          }),
        },
        input,
      ),
    createGate: (projectId, gateType) => createGate(db, projectId, gateType),
    setStatus: (projectId, status, trigger) => setProjectStatus(db, projectId, status, trigger),
    getProjectStatus: (projectId) => getProjectStatus(db, projectId),
  };
}

export function setupWorkflowTest(): {
  db: Db;
  deps: RequirementWorkflowDeps;
  projectId: string;
  cleanup: () => void;
} {
  const { db, cleanup } = setupTestDb();
  registerRequirementAgents(db);
  const projectId = seedProject(db);
  return {
    db,
    deps: createWorkflowDeps(db),
    projectId,
    cleanup,
  };
}
