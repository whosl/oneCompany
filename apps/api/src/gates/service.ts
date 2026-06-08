import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { emit, humanGates, type Db, type EventEnvelope } from "@oc/shared";

export type GateRecord = {
  id: string;
  projectId: string;
  gateType: string;
  status: "open" | "resolved";
  options: string[];
  decision: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export function createGateService(db: Db, onEvent: (envelope: EventEnvelope) => void) {
  return {
    createGate(projectId: string, gateType: string, options: string[]): GateRecord {
      const id = randomUUID();
      const now = new Date().toISOString();

      db.insert(humanGates)
        .values({
          id,
          project_id: projectId,
          gate_type: gateType,
          status: "open",
          options: JSON.stringify(options),
          decision: null,
          created_at: now,
          resolved_at: null,
        })
        .run();

      const envelope = emit(db, {
        projectId,
        payload: { type: "human_gate.created", projectId, gateId: id, gateType },
      });
      onEvent(envelope);

      return {
        id,
        projectId,
        gateType,
        status: "open",
        options,
        decision: null,
        createdAt: now,
        resolvedAt: null,
      };
    },

    getGate(gateId: string): GateRecord | null {
      const [row] = db.select().from(humanGates).where(eq(humanGates.id, gateId)).limit(1).all();
      if (!row) {
        return null;
      }
      return {
        id: row.id,
        projectId: row.project_id,
        gateType: row.gate_type,
        status: row.status as "open" | "resolved",
        options: JSON.parse(row.options) as string[],
        decision: row.decision,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at,
      };
    },

    resolveGate(gateId: string, decision: string): GateRecord {
      const gate = this.getGate(gateId);
      if (!gate) {
        throw new Error(`Gate not found: ${gateId}`);
      }
      if (gate.status !== "open") {
        throw new Error(`Gate is not open: ${gateId}`);
      }

      const now = new Date().toISOString();
      db.update(humanGates)
        .set({
          status: "resolved",
          decision,
          resolved_at: now,
        })
        .where(eq(humanGates.id, gateId))
        .run();

      const envelope = emit(db, {
        projectId: gate.projectId,
        payload: {
          type: "human_gate.resolved",
          projectId: gate.projectId,
          gateId,
          decision,
        },
      });
      onEvent(envelope);

      return {
        ...gate,
        status: "resolved",
        decision,
        resolvedAt: now,
      };
    },

    async waitForGate(
      gateId: string,
      options: { pollMs?: number; timeoutMs?: number } = {},
    ): Promise<string> {
      const pollMs = options.pollMs ?? 100;
      const timeoutMs = options.timeoutMs ?? 10_000;
      const started = Date.now();

      while (Date.now() - started < timeoutMs) {
        const gate = this.getGate(gateId);
        if (!gate) {
          throw new Error(`Gate not found: ${gateId}`);
        }
        if (gate.status === "resolved" && gate.decision) {
          return gate.decision;
        }
        await new Promise((resolve) => setTimeout(resolve, pollMs));
      }

      throw new Error(`Timed out waiting for gate: ${gateId}`);
    },
  };
}

export type GateService = ReturnType<typeof createGateService>;
