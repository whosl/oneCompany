/**
 * Slice-boundary typecheck failure — exercises the path where a slice's
 * authoritative tests pass but the whole-repo `tsc --noEmit` fails, causing
 * the slice to retry until budget exhaustion and raise the slice_failure gate.
 *
 * This edge is unreachable from the API-level state-machine-walk test and from
 * slice-failure-gate.test.ts (which uses alwaysFail on runAuthoritativeCheck,
 * not runSliceTypecheck).
 */
import { describe, expect, it } from "vitest";
import {
  createDevelopmentDeps,
  setupDevelopmentTest,
  waitForSliceLoopIdle,
  type DevelopmentDepsOptions,
} from "../test-utils.js";
import { resumeDevelopmentAfterGate, startDevelopment } from "./engine.js";
import { loadDevSession } from "./state.js";

/**
 * Like setupDevelopmentTest but injects a runSliceTypecheck that always fails.
 * The authoritative check still passes (default), so the ONLY failure source
 * is the typecheck boundary — isolating the code path under test.
 */
function setupWithTypecheckFailure(options: DevelopmentDepsOptions = {}) {
  const harness = setupDevelopmentTest(options);
  // runSliceTypecheck is optional on DevelopmentWorkflowDeps. Injecting it
  // here mirrors what apps/api/src/development/deps.ts does in real mode.
  harness.deps.runSliceTypecheck = async () => ({
    passed: false,
    details: "fixture: TS2345 type error in generated/app.ts",
  });
  return harness;
}

describe("slice-boundary typecheck failure", () => {
  it("raises slice_failure gate when tests pass but typecheck consistently fails", async () => {
    const { db, deps, projectId, repoPath, cleanup } = setupWithTypecheckFailure();
    try {
      // 1. Start development → architect → planner → tech_plan_confirm gate.
      await startDevelopment(deps, { projectId, repoPath });

      // 2. Approve the tech plan → slice loop starts in background.
      await resumeDevelopmentAfterGate(deps, { projectId, decision: "approve" });

      // 3. Wait for the slice loop to exhaust its retry budget.
      //    Every attempt: authoritative passes, typecheck fails → retry.
      //    After maxSliceAttempts (4), a slice_failure gate is raised.
      await waitForSliceLoopIdle(db, projectId);

      const payload = loadDevSession(db, projectId);
      expect(payload.meta.phase).toBe("awaiting_gate");
      expect(payload.meta.gateType).toBe("slice_failure");

      // The test result details should mention the typecheck failure.
      const typecheckResult = payload.state.testResults.find((r) =>
        r.details?.includes("typecheck"),
      );
      expect(typecheckResult).toBeDefined();
      expect(typecheckResult!.details).toContain("fixture: TS2345");
    } finally {
      cleanup();
    }
  });

  it("records the failure as a build/type category in the digest", async () => {
    const { db, deps, projectId, repoPath, cleanup } = setupWithTypecheckFailure();
    try {
      await startDevelopment(deps, { projectId, repoPath });
      await resumeDevelopmentAfterGate(deps, { projectId, decision: "approve" });
      await waitForSliceLoopIdle(db, projectId);

      const payload = loadDevSession(db, projectId);

      // The sliceFailureDigest should capture the typecheck category so the
      // user sees a meaningful diagnosis instead of a generic "tests failed".
      expect(payload.meta.sliceFailureDigest).toBeDefined();
      expect(payload.meta.sliceFailureDigest!.sliceId).toBe("slice-1");

      // Risks should include the diagnosis gate note.
      const diagnosisRisk = payload.state.risks.find((r) => r.includes("Diagnosis gate"));
      expect(diagnosisRisk).toBeDefined();
    } finally {
      cleanup();
    }
  });

  it("recovers when typecheck starts passing after retry gate resolution", async () => {
    const { db, deps, projectId, repoPath, cleanup } = setupWithTypecheckFailure();
    try {
      // Reach the gate via typecheck failures.
      await startDevelopment(deps, { projectId, repoPath });
      await resumeDevelopmentAfterGate(deps, { projectId, decision: "approve" });
      await waitForSliceLoopIdle(db, projectId);
      expect(loadDevSession(db, projectId).meta.gateType).toBe("slice_failure");

      // Replace the failing typecheck — next run should pass cleanly.
      deps.runSliceTypecheck = async () => ({
        passed: true,
        details: "fixture typecheck pass",
      });

      // Resolve with retry → slice loop restarts with a passing typecheck.
      await resumeDevelopmentAfterGate(deps, { projectId, decision: "retry" });
      await waitForSliceLoopIdle(db, projectId);

      const payload = loadDevSession(db, projectId);
      expect(payload.meta.phase).toBe("completed");
    } finally {
      cleanup();
    }
  });
});
