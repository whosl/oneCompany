import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  assertAllowedDecision,
  emit,
  getAllowedOptions,
  getGateDefinition,
  humanGates,
  normalizeDecision,
  parseGatePayload,
  serializeGatePayload,
  type Db,
  type EventEnvelope,
  type GateMetadata,
  type ResolveGateInput,
} from "@oc/shared";

export type GateRecord = {
  id: string;
  projectId: string;
  gateType: string;
  status: "open" | "resolved";
  options: string[];
  metadata?: GateMetadata;
  decision: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type GateServiceOptions = {
  onGateResolved?: (gate: GateRecord, decision: string) => Promise<void>;
};

function toGateRecord(row: typeof humanGates.$inferSelect): GateRecord {
  const payload = parseGatePayload(row.options);
  return {
    id: row.id,
    projectId: row.project_id,
    gateType: row.gate_type,
    status: row.status as "open" | "resolved",
    options: payload.options,
    metadata: payload.metadata,
    decision: row.decision,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

export function createGateService(
  db: Db,
  onEvent: (envelope: EventEnvelope) => void,
  options: GateServiceOptions = {},
) {
  return {
    createGate(
      projectId: string,
      gateType: string,
      metadata?: GateMetadata,
    ): GateRecord {
      getGateDefinition(gateType);
      const allowedOptions = [...getAllowedOptions(gateType, metadata)];
      const id = randomUUID();
      const now = new Date().toISOString();

      db.insert(humanGates)
        .values({
          id,
          project_id: projectId,
          gate_type: gateType,
          status: "open",
          options: serializeGatePayload(allowedOptions, metadata),
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
        options: allowedOptions,
        metadata,
        decision: null,
        createdAt: now,
        resolvedAt: null,
      };
    },

    getGate(gateId: string): GateRecord | null {
      const row = db.select().from(humanGates).where(eq(humanGates.id, gateId)).all()[0];
      if (!row) {
        return null;
      }
      return toGateRecord(row);
    },

    listOpenGates(projectId: string): GateRecord[] {
      return db
        .select()
        .from(humanGates)
        .where(and(eq(humanGates.project_id, projectId), eq(humanGates.status, "open")))
        .all()
        .map(toGateRecord);
    },

    async resolveGate(gateId: string, input: ResolveGateInput): Promise<GateRecord> {
      const gate = this.getGate(gateId);
      if (!gate) {
        throw new Error(`Gate not found: ${gateId}`);
      }
      if (gate.status !== "open") {
        throw new Error(`Gate is not open: ${gateId}`);
      }

      const decision = normalizeDecision(input);
      assertAllowedDecision(gate.gateType, decision, gate.metadata);

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

      const resolved: GateRecord = {
        ...gate,
        status: "resolved",
        decision,
        resolvedAt: now,
      };

      if (options.onGateResolved) {
        await options.onGateResolved(resolved, decision);
      }

      return resolved;
    },

    async waitForGate(
      gateId: string,
      waitOptions: { pollMs?: number; timeoutMs?: number } = {},
    ): Promise<string> {
      const pollMs = waitOptions.pollMs ?? 100;
      const timeoutMs = waitOptions.timeoutMs ?? 10_000;
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
