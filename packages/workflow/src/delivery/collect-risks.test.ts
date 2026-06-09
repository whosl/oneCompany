import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { emit, humanGates, serializeGatePayload } from "@oc/shared";
import { collectProjectRisks } from "./collect-risks.js";
import { seedProject, setupTestDb } from "../test-utils.js";

describe("collectProjectRisks", () => {
  it("includes gate type from resolved events and human_gates fallback", () => {
    const { db, cleanup } = setupTestDb();
    try {
      const projectId = seedProject(db);
      const gateId = randomUUID();
      const now = new Date().toISOString();

      db.insert(humanGates)
        .values({
          id: gateId,
          project_id: projectId,
          gate_type: "requirement_stuck",
          status: "resolved",
          options: serializeGatePayload(["force_continue"]),
          decision: "force_continue",
          created_at: now,
          resolved_at: now,
        })
        .run();

      emit(db, {
        projectId,
        payload: {
          type: "human_gate.resolved",
          projectId,
          gateId,
          decision: "force_continue",
          gateType: "requirement_stuck",
        },
      });

      const legacyGateId = randomUUID();
      db.insert(humanGates)
        .values({
          id: legacyGateId,
          project_id: projectId,
          gate_type: "slice_failure",
          status: "resolved",
          options: serializeGatePayload(["request_skip_slice"]),
          decision: "request_skip_slice",
          created_at: now,
          resolved_at: now,
        })
        .run();

      emit(db, {
        projectId,
        payload: {
          type: "human_gate.resolved",
          projectId,
          gateId: legacyGateId,
          decision: "request_skip_slice",
        },
      });

      const risks = collectProjectRisks(db, projectId, []);
      expect(risks).toContain("Gate decision (requirement_stuck): force_continue");
      expect(risks).toContain("Gate decision (slice_failure): request_skip_slice");
    } finally {
      cleanup();
    }
  });
});
