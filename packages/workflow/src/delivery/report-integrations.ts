import { eq } from "drizzle-orm";
import { integrationConnections, integrationToolCalls, type Db } from "@oc/shared";

export function buildIntegrationReportNotes(db: Db, projectId: string): string[] {
  const notes: string[] = [];

  const connections = db
    .select()
    .from(integrationConnections)
    .where(eq(integrationConnections.project_id, projectId))
    .all();

  for (const row of connections) {
    if (row.status === "offline_fallback") {
      notes.push(
        `Integration ${row.integration_id} ran in offline fallback mode; verify manual follow-up steps.`,
      );
    }
  }

  const offlineCalls = db
    .select()
    .from(integrationToolCalls)
    .where(eq(integrationToolCalls.project_id, projectId))
    .all()
    .filter((row) => row.mode === "offline");

  if (offlineCalls.length > 0) {
    notes.push(
      `Offline Skill Pack tool calls: ${offlineCalls.map((row) => `${row.integration_id}:${row.tool_name}`).join(", ")}`,
    );
  }

  if (process.env.OC_OFFLINE_MODE === "1") {
    notes.push("System offline mode was enabled (OC_OFFLINE_MODE=1) during delivery.");
  }

  return notes;
}
