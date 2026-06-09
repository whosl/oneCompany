import { eq } from "drizzle-orm";
import { events, humanGates, redact, type Db } from "@oc/shared";

const GATE_RISK_DECISIONS = new Set([
  "force_continue",
  "skip_risk_and_continue",
  "update_plan",
  "request_skip_slice",
]);

export function collectProjectRisks(db: Db, projectId: string, stateRisks: string[]): string[] {
  const rows = db
    .select()
    .from(events)
    .where(eq(events.project_id, projectId))
    .all();

  const gateTypeById = new Map(
    db
      .select({ id: humanGates.id, gate_type: humanGates.gate_type })
      .from(humanGates)
      .where(eq(humanGates.project_id, projectId))
      .all()
      .map((row) => [row.id, row.gate_type] as const),
  );

  const aggregated = new Set<string>(stateRisks);

  for (const row of rows) {
    const payload = JSON.parse(row.payload) as {
      type?: string;
      decision?: string;
      gateType?: string;
      gateId?: string;
    };
    if (payload.type === "human_gate.resolved" && payload.decision) {
      if (GATE_RISK_DECISIONS.has(payload.decision)) {
        const gateType =
          payload.gateType ??
          (payload.gateId ? gateTypeById.get(payload.gateId) : undefined) ??
          "unknown";
        aggregated.add(`Gate decision (${gateType}): ${payload.decision}`);
      }
    }
    if (payload.type === "change_request.resolved" && payload.decision === "update_plan") {
      aggregated.add("Approved acceptance-scope change via Change Review");
    }
  }

  return [...aggregated].map((risk) => redact(risk).text);
}
