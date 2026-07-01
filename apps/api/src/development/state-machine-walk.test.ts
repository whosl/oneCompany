/**
 * Development state machine — full edge walk via real API.
 *
 * Tests every transition edge in the development workflow by hitting the
 * actual HTTP endpoints (via Hono's app.request). Uses OC_USE_STUB_ENGINE=1
 * so no real LLM is needed; stub harness auto-passes slices.
 *
 * For edges unreachable via stub (slice failure, change review), we inject
 * the session/gate state directly into the DB, then test resolution via the
 * real POST /gates/:id/resolve endpoint.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  createDevSession,
  getSliceLoopBackgroundError,
  loadDevSession,
  saveDevSession,
  type DevelopmentSessionPayload,
} from "@oc/workflow";
import {
  acceptanceCriteriaVersions,
  changeRequests,
  devSessions,
  humanGates,
  prdVersions,
  projects as projectsTable,
  serializeGatePayload,
  techPlanVersions,
} from "@oc/shared";
import { setupTestApp } from "../test-utils.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedPrdReady(db: ReturnType<typeof setupTestApp>["db"], projectId: string): void {
  const now = new Date().toISOString();
  db.insert(projectsTable)
    .values({
      id: projectId,
      name: `SM-${projectId.slice(0, 8)}`,
      slug: `sm-${projectId.slice(0, 8)}`,
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
      content: "# PRD\n\nBuild a todo app.",
      created_at: now,
    })
    .run();
  db.insert(acceptanceCriteriaVersions)
    .values({
      id: randomUUID(),
      project_id: projectId,
      version: "ac-1",
      content: "- User can add a todo",
      created_at: now,
    })
    .run();
}

async function startDevelopment(
  app: ReturnType<typeof setupTestApp>["app"],
  projectId: string,
): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  const res = await app.request(`/projects/${projectId}/development/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function resolveGate(
  app: ReturnType<typeof setupTestApp>["app"],
  gateId: string,
  decision: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.request(`/gates/${gateId}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function listOpenGates(
  app: ReturnType<typeof setupTestApp>["app"],
  projectId: string,
): Promise<Array<{ id: string; gateType: string; status: string }>> {
  const res = await app.request(`/projects/${projectId}/gates`);
  const body = (await res.json()) as { gates: Array<{ id: string; gateType: string; status: string }> };
  return (body.gates ?? []).filter((g) => g.status === "open");
}

async function findOpenGate(
  app: ReturnType<typeof setupTestApp>["app"],
  projectId: string,
  gateType: string,
): Promise<{ id: string; gateType: string } | undefined> {
  return (await listOpenGates(app, projectId)).find((g) => g.gateType === gateType);
}

function setStatus(db: ReturnType<typeof setupTestApp>["db"], projectId: string, status: string): void {
  db.update(projectsTable)
    .set({ status, updated_at: new Date().toISOString() })
    .where(eq(projectsTable.id, projectId))
    .run();
}

function getSessionPhase(
  db: ReturnType<typeof setupTestApp>["db"],
  projectId: string,
): string {
  const payload = loadDevSession(db, projectId);
  return payload.meta.phase;
}

/**
 * Inject an open slice_failure gate + matching dev session state.
 * This simulates what runSliceIteration does when budget is exhausted.
 */
function injectSliceFailureGate(
  db: ReturnType<typeof setupTestApp>["db"],
  projectId: string,
  sliceId = "slice-1",
  options: { seedTechPlan?: boolean } = {},
): string {
  const { seedTechPlan = true } = options;
  const gateId = randomUUID();
  const now = new Date().toISOString();
  const gateOptions = ["retry", "replan", "replan_slices", "request_skip_slice", "fail"];

  db.insert(humanGates)
    .values({
      id: gateId,
      project_id: projectId,
      gate_type: "slice_failure",
      status: "open",
      options: serializeGatePayload(gateOptions, undefined),
      decision: null,
      created_at: now,
      resolved_at: null,
    })
    .run();

  // Ensure dev session exists with a pending slice to retry.
  let payload: DevelopmentSessionPayload;
  const existing = db.select().from(devSessions).where(eq(devSessions.project_id, projectId)).all();
  if (existing.length > 0) {
    payload = loadDevSession(db, projectId);
  } else {
    payload = createDevSession(db, projectId, `/tmp/sm-${projectId.slice(0, 8)}`, "minimal");
  }

  // Ensure there's a pending slice in the queue.
  if (!payload.state.taskQueue.some((t: { id: string }) => t.id === sliceId)) {
    payload = {
      ...payload,
      state: {
        ...payload.state,
        taskQueue: [
          ...payload.state.taskQueue,
          {
            id: sliceId,
            title: "Test slice",
            testCommand: "pnpm vitest run --reporter=json",
            status: "failed",
          },
        ],
      },
    };
  }

  // Seed a tech plan so replan/replan_slices paths don't crash.
  // (In real flow, the architect step creates this before slicing starts.)
  if (seedTechPlan) {
    const tpNow = new Date().toISOString();
    if (!payload.state.techPlanVersion) {
      payload = {
        ...payload,
        state: { ...payload.state, techPlanVersion: "tp-1" },
      };
    }
    const hasTechPlan = db.select().from(techPlanVersions).where(eq(techPlanVersions.project_id, projectId)).all().length > 0;
    if (!hasTechPlan) {
      db.insert(techPlanVersions)
        .values({
          id: randomUUID(),
          project_id: projectId,
          version: "tp-1",
          content: "# Tech Plan\n\nStack: TypeScript, Vitest",
          created_at: tpNow,
        })
        .run();
    }
  }

  payload = {
    ...payload,
    meta: {
      ...payload.meta,
      phase: "awaiting_gate",
      gateType: "slice_failure",
      gateId,
      currentSliceId: sliceId,
    },
  };
  saveDevSession(db, projectId, payload);
  setStatus(db, projectId, "Developing");
  return gateId;
}

/**
 * Inject an open change_review gate + matching dev session state.
 */
function injectChangeReviewGate(
  db: ReturnType<typeof setupTestApp>["db"],
  projectId: string,
  kind: "skip_slice" | "requirement_change" = "skip_slice",
  sliceId = "slice-1",
): string {
  const gateId = randomUUID();
  const now = new Date().toISOString();
  const options = ["update_plan", "revise_tech_plan", "reject"];

  db.insert(humanGates)
    .values({
      id: gateId,
      project_id: projectId,
      gate_type: "change_review",
      status: "open",
      options: serializeGatePayload(options, undefined),
      decision: null,
      created_at: now,
      resolved_at: null,
    })
    .run();

  // Ensure dev session exists (injectSliceFailureGate may not have run).
  const existing = db.select().from(devSessions).where(eq(devSessions.project_id, projectId)).all();
  let payload: DevelopmentSessionPayload;
  if (existing.length > 0) {
    payload = loadDevSession(db, projectId);
  } else {
    payload = createDevSession(db, projectId, `/tmp/sm-${projectId.slice(0, 8)}`, "minimal");
  }

  // Insert the change_request row that handleChangeReviewDecision resolves.
  const changeRequestId = payload.meta.pendingChangeRequestId ?? randomUUID();
  db.insert(changeRequests)
    .values({
      id: changeRequestId,
      project_id: projectId,
      summary: kind === "skip_slice" ? `Skip slice ${sliceId}` : "Requirement change",
      kind,
      status: "open",
      created_at: new Date().toISOString(),
    })
    .onConflictDoNothing()
    .run();

  if (!payload.state.taskQueue.some((t: { id: string }) => t.id === sliceId)) {
    payload = {
      ...payload,
      state: {
        ...payload.state,
        taskQueue: [
          ...payload.state.taskQueue,
          {
            id: sliceId,
            title: "Test slice",
            testCommand: "pnpm vitest run --reporter=json",
            status: "pending",
          },
        ],
      },
    };
  }
  payload = {
    ...payload,
    meta: {
      ...payload.meta,
      phase: "change_review",
      gateType: "change_review",
      gateId,
      currentSliceId: sliceId,
      pendingChangeRequestId: changeRequestId,
      pendingChangeRequestKind: kind,
    },
  };
  saveDevSession(db, projectId, payload);
  setStatus(db, projectId, "Change Review");
  return gateId;
}

/**
 * Poll until the dev session reaches one of `targetPhases`, or throw on
 * timeout. Detects background errors and hangs (phase stuck in "slicing"
 * beyond a reasonable window).
 */
async function waitForPhase(
  db: ReturnType<typeof setupTestApp>["db"],
  projectId: string,
  targetPhases: string[],
  timeoutMs = 12_000,
): Promise<DevelopmentSessionPayload> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const payload = loadDevSession(db, projectId);
    if (targetPhases.includes(payload.meta.phase)) {
      const bgError = getSliceLoopBackgroundError(projectId);
      if (bgError) {
        throw new Error(`Background slice loop failed: ${bgError}`);
      }
      return payload;
    }
    const bgError = getSliceLoopBackgroundError(projectId);
    if (bgError) {
      throw new Error(`Background slice loop failed: ${bgError}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const current = loadDevSession(db, projectId);
  const bgError = getSliceLoopBackgroundError(projectId);
  throw new Error(
    `Timed out waiting for phase ${targetPhases.join("/")} (got ${current.meta.phase}, bgError=${bgError ?? "none"})`,
  );
}

const TIMEOUT = 15_000;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("development state machine — edge walk", () => {
  describe("edge: PRD Ready → (start) → tech_plan_confirm gate", () => {
    it("starts development and raises tech_plan_confirm gate", async () => {
      const { app, db, cleanup } = setupTestApp();
      try {
        const projectId = randomUUID();
        seedPrdReady(db, projectId);

        const { status, body } = await startDevelopment(app, projectId);
        expect(status).toBe(200);
        expect(body.phase).toBe("awaiting_gate");
        expect(body.gateType).toBe("tech_plan_confirm");
        expect(body.projectStatus).toBe("Tech Plan Review");

        const gate = await findOpenGate(app, projectId, "tech_plan_confirm");
        expect(gate).toBeDefined();
      } finally {
        cleanup();
      }
    });

    it("rejects start when status is not PRD Ready", async () => {
      const { app, db, cleanup } = setupTestApp();
      try {
        const projectId = randomUUID();
        const now = new Date().toISOString();
        db.insert(projectsTable)
          .values({
            id: projectId,
            name: "Bad",
            slug: "bad",
            status: "Developing",
            created_at: now,
            updated_at: now,
          })
          .run();

        const { status, body } = await startDevelopment(app, projectId);
        expect(status).toBe(400);
        // Developing without a dev session → resumeOrphanedSliceLoop throws.
        expect(String(body.error)).toContain("session");
      } finally {
        cleanup();
      }
    });
  });

  describe("edge: tech_plan_confirm → (approve) → slicing → completed → Testing", () => {
    it(
      "walks the happy path to completion",
      async () => {
        const { app, db, cleanup } = setupTestApp();
        try {
          const projectId = randomUUID();
          seedPrdReady(db, projectId);

          await startDevelopment(app, projectId);
          const gate = await findOpenGate(app, projectId, "tech_plan_confirm");
          expect(gate).toBeDefined();

          const { status } = await resolveGate(app, gate!.id, "approve");
          expect(status).toBe(200);

          // Wait for slice loop to finish (stub auto-passes).
          const payload = await waitForPhase(db, projectId, ["completed"], TIMEOUT);
          expect(payload.meta.phase).toBe("completed");

          // Status should transition to Testing.
          const project = db
            .select()
            .from(projectsTable)
            .where(eq(projectsTable.id, projectId))
            .all()[0];
          expect(project?.status).toBe("Testing");
        } finally {
          cleanup();
        }
      },
      TIMEOUT,
    );
  });

  describe("edge: tech_plan_confirm → (reject_and_redo) → tech_plan_confirm again", () => {
    it(
      "re-raises tech plan gate after rejection",
      async () => {
        const { app, db, cleanup } = setupTestApp();
        try {
          const projectId = randomUUID();
          seedPrdReady(db, projectId);

          await startDevelopment(app, projectId);
          const gate1 = await findOpenGate(app, projectId, "tech_plan_confirm");

          const { status } = await resolveGate(app, gate1!.id, "reject_and_redo");
          expect(status).toBe(200);

          // Should have a NEW tech_plan_confirm gate open.
          const gate2 = await findOpenGate(app, projectId, "tech_plan_confirm");
          expect(gate2).toBeDefined();
          expect(gate2!.id).not.toBe(gate1!.id);

          expect(getSessionPhase(db, projectId)).toBe("awaiting_gate");
        } finally {
          cleanup();
        }
      },
      TIMEOUT,
    );
  });

  describe("edge: tech_plan_confirm → (revise_then_approve) → tech_plan_confirm", () => {
    it(
      "re-raises tech plan gate after revise",
      async () => {
        const { app, db, cleanup } = setupTestApp();
        try {
          const projectId = randomUUID();
          seedPrdReady(db, projectId);

          await startDevelopment(app, projectId);
          const gate1 = await findOpenGate(app, projectId, "tech_plan_confirm");

          const { status } = await resolveGate(app, gate1!.id, "revise_then_approve");
          expect(status).toBe(200);

          const gate2 = await findOpenGate(app, projectId, "tech_plan_confirm");
          expect(gate2).toBeDefined();
          expect(gate2!.id).not.toBe(gate1!.id);
        } finally {
          cleanup();
        }
      },
      TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  // slice_failure gate — all 5 decisions
  // -------------------------------------------------------------------------

  describe("edge: slice_failure → (retry) → slicing", () => {
    it(
      "resumes slicing with extended budget",
      async () => {
        const { app, db, cleanup } = setupTestApp();
        try {
          const projectId = randomUUID();
          seedPrdReady(db, projectId);
          const gateId = injectSliceFailureGate(db, projectId, "slice-retry");
          const budgetBefore = loadDevSession(db, projectId).meta.sliceRetryBudgetExtension ?? 0;

          const { status } = await resolveGate(app, gateId, "retry");
          expect(status).toBe(200);

          const payload = await waitForPhase(db, projectId, ["completed"], TIMEOUT);
          // Budget should have increased by SLICE_RETRY_BUDGET_EXTENSION (4).
          expect((payload.meta.sliceRetryBudgetExtension ?? 0) - budgetBefore).toBe(4);
          // Stub auto-passes → eventually completed.
          expect(payload.meta.phase).toBe("completed");
        } finally {
          cleanup();
        }
      },
      TIMEOUT,
    );
  });

  describe("edge: slice_failure → (replan) → tech_plan_confirm", () => {
    it(
      "goes back to tech plan review",
      async () => {
        const { app, db, cleanup } = setupTestApp();
        try {
          const projectId = randomUUID();
          seedPrdReady(db, projectId);
          const gateId = injectSliceFailureGate(db, projectId, "slice-replan");

          const { status } = await resolveGate(app, gateId, "replan");
          expect(status).toBe(200);

          const gate = await findOpenGate(app, projectId, "tech_plan_confirm");
          expect(gate).toBeDefined();
          expect(getSessionPhase(db, projectId)).toBe("awaiting_gate");
        } finally {
          cleanup();
        }
      },
      TIMEOUT,
    );
  });

  describe("edge: slice_failure → (replan_slices) → slicing", () => {
    it(
      "re-plans slices and resumes loop",
      async () => {
        const { app, db, cleanup } = setupTestApp();
        try {
          const projectId = randomUUID();
          seedPrdReady(db, projectId);
          const gateId = injectSliceFailureGate(db, projectId, "slice-replanslices");

          const { status } = await resolveGate(app, gateId, "replan_slices");
          expect(status).toBe(200);

          const payload = await waitForPhase(db, projectId, ["completed"], TIMEOUT);
          expect(payload.meta.phase).toBe("completed");
        } finally {
          cleanup();
        }
      },
      TIMEOUT,
    );
  });

  describe("edge: slice_failure → (request_skip_slice) → change_review", () => {
    it("transitions to change review gate", async () => {
      const { app, db, cleanup } = setupTestApp();
      try {
        const projectId = randomUUID();
        seedPrdReady(db, projectId);
        const gateId = injectSliceFailureGate(db, projectId, "slice-skip");

        const { status } = await resolveGate(app, gateId, "request_skip_slice");
        expect(status).toBe(200);

        const gate = await findOpenGate(app, projectId, "change_review");
        expect(gate).toBeDefined();
        expect(getSessionPhase(db, projectId)).toBe("change_review");

        const project = db
          .select()
          .from(projectsTable)
          .where(eq(projectsTable.id, projectId))
          .all()[0];
        expect(project?.status).toBe("Change Review");
      } finally {
        cleanup();
      }
    });
  });

  describe("edge: slice_failure → (fail) → Failed [TERMINAL]", () => {
    it("marks project as Failed (terminal state)", async () => {
      const { app, db, cleanup } = setupTestApp();
      try {
        const projectId = randomUUID();
        seedPrdReady(db, projectId);
        const gateId = injectSliceFailureGate(db, projectId, "slice-fail");

        const { status } = await resolveGate(app, gateId, "fail");
        expect(status).toBe(200);

        // Session phase should be "failed" (terminal).
        expect(getSessionPhase(db, projectId)).toBe("failed");

        const project = db
          .select()
          .from(projectsTable)
          .where(eq(projectsTable.id, projectId))
          .all()[0];
        expect(project?.status).toBe("Failed");
      } finally {
        cleanup();
      }
    });
  });

  // -------------------------------------------------------------------------
  // change_review gate — all 3 decisions
  // -------------------------------------------------------------------------

  describe("edge: change_review → (update_plan) → slicing", () => {
    it(
      "skips slice and resumes development",
      async () => {
        const { app, db, cleanup } = setupTestApp();
        try {
          const projectId = randomUUID();
          seedPrdReady(db, projectId);
          const gateId = injectChangeReviewGate(db, projectId, "skip_slice", "slice-cr-update");

          const { status } = await resolveGate(app, gateId, "update_plan");
          expect(status).toBe(200);

          const payload = await waitForPhase(db, projectId, ["completed"], TIMEOUT);
          expect(payload.meta.phase).toBe("completed");
        } finally {
          cleanup();
        }
      },
      TIMEOUT,
    );
  });

  describe("edge: change_review → (revise_tech_plan) → tech_plan_confirm", () => {
    it(
      "goes back to tech plan review",
      async () => {
        const { app, db, cleanup } = setupTestApp();
        try {
          const projectId = randomUUID();
          seedPrdReady(db, projectId);
          const gateId = injectChangeReviewGate(db, projectId, "skip_slice", "slice-cr-revise");

          const { status } = await resolveGate(app, gateId, "revise_tech_plan");
          expect(status).toBe(200);

          const gate = await findOpenGate(app, projectId, "tech_plan_confirm");
          expect(gate).toBeDefined();
        } finally {
          cleanup();
        }
      },
      TIMEOUT,
    );
  });

  describe("edge: change_review → (reject) → slice_failure [skip_slice]", () => {
    it("rejects skip and reopens slice failure gate", async () => {
      const { app, db, cleanup } = setupTestApp();
      try {
        const projectId = randomUUID();
        seedPrdReady(db, projectId);
        const gateId = injectChangeReviewGate(db, projectId, "skip_slice", "slice-cr-reject");

        const { status } = await resolveGate(app, gateId, "reject");
        expect(status).toBe(200);

        const gate = await findOpenGate(app, projectId, "slice_failure");
        expect(gate).toBeDefined();
        expect(getSessionPhase(db, projectId)).toBe("awaiting_gate");

        const project = db
          .select()
          .from(projectsTable)
          .where(eq(projectsTable.id, projectId))
          .all()[0];
        expect(project?.status).toBe("Developing");
      } finally {
        cleanup();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases & dead-ends
  // -------------------------------------------------------------------------

  describe("edge case: resolve already-resolved gate", () => {
    it("returns idempotent result for same decision", async () => {
      const { app, db, cleanup } = setupTestApp();
      try {
        const projectId = randomUUID();
        seedPrdReady(db, projectId);
        const gateId = injectSliceFailureGate(db, projectId, "slice-idempotent");

        const r1 = await resolveGate(app, gateId, "fail");
        expect(r1.status).toBe(200);

        // Resolving again with same decision should be idempotent (not 500).
        const r2 = await resolveGate(app, gateId, "fail");
        expect(r2.status).toBe(200);
      } finally {
        cleanup();
      }
    });

    it("returns conflict for different decision on resolved gate", async () => {
      const { app, db, cleanup } = setupTestApp();
      try {
        const projectId = randomUUID();
        seedPrdReady(db, projectId);
        const gateId = injectSliceFailureGate(db, projectId, "slice-conflict");

        const r1 = await resolveGate(app, gateId, "fail");
        expect(r1.status).toBe(200);

        // Different decision on already-resolved gate → conflict.
        const r2 = await resolveGate(app, gateId, "retry");
        expect(r2.status).toBeGreaterThanOrEqual(400);
      } finally {
        cleanup();
      }
    });
  });

  describe("edge case: invalid gate decision", () => {
    it("rejects unknown decision with 400", async () => {
      const { app, db, cleanup } = setupTestApp();
      try {
        const projectId = randomUUID();
        seedPrdReady(db, projectId);
        const gateId = injectSliceFailureGate(db, projectId, "slice-bad");

        const { status } = await resolveGate(app, gateId, "bogus_decision");
        expect(status).toBeGreaterThanOrEqual(400);
      } finally {
        cleanup();
      }
    });
  });

  describe("edge case: resume orphaned slice loop", () => {
    it(
      "resumes a slicing project whose loop died (process restart sim)",
      async () => {
        const { app, db, cleanup } = setupTestApp();
        try {
          const projectId = randomUUID();
          seedPrdReady(db, projectId);

          // Seed a dev session stuck in "slicing" with pending tasks.
          const payload = createDevSession(
            db,
            projectId,
            `/tmp/sm-orphan-${projectId.slice(0, 8)}`,
            "minimal",
          );
          saveDevSession(db, projectId, {
            ...payload,
            state: {
              ...payload.state,
              taskQueue: [
                {
                  id: "slice-orphan",
                  title: "Orphan slice",
                  testCommand: "pnpm vitest run --reporter=json",
                  status: "pending",
                },
              ],
            },
            meta: { ...payload.meta, phase: "slicing" },
          });
          setStatus(db, projectId, "Developing");

          // Calling start on a Developing project triggers resumeOrphanedSliceLoop.
          const { status, body } = await startDevelopment(app, projectId);
          expect(status).toBe(202);

          const result = await waitForPhase(db, projectId, ["completed"], TIMEOUT);
          expect(result.meta.phase).toBe("completed");
          expect(getSliceLoopBackgroundError(projectId)).toBeUndefined();
        } finally {
          cleanup();
        }
      },
      TIMEOUT,
    );
  });

  describe("edge case: resolve gate for non-existent project", () => {
    it("returns error for missing gate", async () => {
      const { app, cleanup } = setupTestApp();
      try {
        const { status } = await resolveGate(app, randomUUID(), "approve");
        expect(status).toBeGreaterThanOrEqual(400);
      } finally {
        cleanup();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Bug-fix verification: replan_slices must not 500 when tech plan is missing
  // -------------------------------------------------------------------------

  describe("bug fix: replan_slices without tech plan in DB", () => {
    it(
      "does not 500 when tech_plan_versions table is empty (planner degrades gracefully)",
      async () => {
        const { app, db, cleanup } = setupTestApp();
        try {
          const projectId = randomUUID();
          seedPrdReady(db, projectId);
          // Deliberately skip tech plan seeding — simulates a partially
          // migrated / corrupted DB where the architect step didn't persist.
          const gateId = injectSliceFailureGate(db, projectId, "slice-no-tp", {
            seedTechPlan: false,
          });

          const { status } = await resolveGate(app, gateId, "replan_slices");
          // Before fix: 500 "Tech plan not found". After fix: 200 (planner
          // regenerates from PRD/acceptance alone).
          expect(status).toBe(200);

          // Slice loop should start and complete (stub auto-passes).
          const payload = await waitForPhase(db, projectId, ["completed"], TIMEOUT);
          expect(payload.meta.phase).toBe("completed");
        } finally {
          cleanup();
        }
      },
      TIMEOUT,
    );
  });
});
