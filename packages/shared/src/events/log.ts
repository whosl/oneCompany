import { randomUUID } from "node:crypto";
import { eq, gt, and, desc } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { events } from "../db/schema.js";
import {
  AgentEventSchema,
  EventEnvelopeSchema,
  type AgentEvent,
  type EventEnvelope,
} from "../schemas/event-envelope.js";

const SCHEMA_VERSION = "1";

export type EmitInput = {
  projectId: string;
  payload: AgentEvent;
  runId?: string;
  agentId?: string;
  correlationId?: string;
};

export function emit(db: Db, input: EmitInput): EventEnvelope {
  const payload = AgentEventSchema.parse(input.payload);

  return db.transaction((tx) => {
    const latest = tx
      .select({ seq: events.seq })
      .from(events)
      .where(eq(events.project_id, input.projectId))
      .orderBy(desc(events.seq))
      .limit(1)
      .all()[0];

    const seq = (latest?.seq ?? 0) + 1;
    const envelope: EventEnvelope = {
      eventId: randomUUID(),
      seq,
      schemaVersion: SCHEMA_VERSION,
      projectId: input.projectId,
      runId: input.runId,
      agentId: input.agentId,
      correlationId: input.correlationId,
      timestamp: new Date().toISOString(),
      payload,
    };

    EventEnvelopeSchema.parse(envelope);

    tx.insert(events)
      .values({
        event_id: envelope.eventId,
        seq: envelope.seq,
        schema_version: envelope.schemaVersion,
        project_id: envelope.projectId,
        run_id: envelope.runId ?? null,
        agent_id: envelope.agentId ?? null,
        correlation_id: envelope.correlationId ?? null,
        timestamp: envelope.timestamp,
        type: envelope.payload.type,
        payload: JSON.stringify(envelope.payload),
      })
      .run();

    return envelope;
  });
}

export function listEvents(
  db: Db,
  projectId: string,
  options: { afterSeq?: number } = {},
): EventEnvelope[] {
  const afterSeq = options.afterSeq ?? 0;
  const rows = db
    .select()
    .from(events)
    .where(and(eq(events.project_id, projectId), gt(events.seq, afterSeq)))
    .orderBy(events.seq)
    .all();

  return rows.map((row) =>
    EventEnvelopeSchema.parse({
      eventId: row.event_id,
      seq: row.seq,
      schemaVersion: row.schema_version,
      projectId: row.project_id,
      runId: row.run_id ?? undefined,
      agentId: row.agent_id ?? undefined,
      correlationId: row.correlation_id ?? undefined,
      timestamp: row.timestamp,
      payload: JSON.parse(row.payload),
    }),
  );
}
