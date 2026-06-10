import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  assertAllowedDecision,
  emit,
  GateResumeConflictError,
  GateResumeFailedError,
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
  const getGate = (gateId: string): GateRecord | null => {
    const row = db.select().from(humanGates).where(eq(humanGates.id, gateId)).all()[0];
    if (!row) {
      return null;
    }
    return toGateRecord(row);
  };

  const createGate = (
    projectId: string,
    gateType: string,
    metadata?: GateMetadata,
  ): GateRecord => {
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
  };

  const listOpenGates = (projectId: string): GateRecord[] => {
    return db
      .select()
      .from(humanGates)
      .where(and(eq(humanGates.project_id, projectId), eq(humanGates.status, "open")))
      .all()
      .map(toGateRecord);
  };

  const resolveGate = async (gateId: string, input: ResolveGateInput): Promise<GateRecord> => {
    const gate = getGate(gateId);
    if (!gate) {
      throw new Error(`Gate not found: ${gateId}`);
    }

    const decision = normalizeDecision(input);

    if (gate.status === "resolved") {
      if (gate.decision === decision) {
        return gate;
      }
      throw new GateResumeConflictError(
        "gate_already_resolved",
        `Gate already resolved with a different decision: ${gateId}`,
      );
    }

    if (gate.status !== "open") {
      throw new GateResumeConflictError("gate_not_open", `Gate is not open: ${gateId}`);
    }

    assertAllowedDecision(gate.gateType, decision, gate.metadata);

    if (options.onGateResolved) {
      try {
        await options.onGateResolved(gate, decision);
      } catch (error) {
        if (error instanceof GateResumeConflictError) {
          throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new GateResumeFailedError(gateId, `Gate resume failed (${gate.gateType}): ${message}`, {
          cause: error,
        });
      }
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
        gateType: gate.gateType,
      },
    });
    onEvent(envelope);

    return {
      ...gate,
      status: "resolved",
      decision,
      resolvedAt: now,
    };
  };

  const waitForGate = async (
    gateId: string,
    waitOptions: { pollMs?: number; timeoutMs?: number } = {},
  ): Promise<string> => {
    const pollMs = waitOptions.pollMs ?? 100;
    const timeoutMs =
      waitOptions.timeoutMs ??
      Number(process.env.OC_GATE_WAIT_TIMEOUT_MS ?? 0);
    const waitForever = timeoutMs <= 0;
    const started = Date.now();

    while (waitForever || Date.now() - started < timeoutMs) {
      const gate = getGate(gateId);
      if (!gate) {
        throw new Error(`Gate not found: ${gateId}`);
      }
      if (gate.status === "resolved" && gate.decision) {
        return gate.decision;
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }

    throw new Error(`Timed out waiting for gate: ${gateId}`);
  };

  return {
    createGate,
    getGate,
    listOpenGates,
    resolveGate,
    waitForGate,
  };
}

export type GateService = ReturnType<typeof createGateService>;
