import { and, eq } from "drizzle-orm";
import {
  AgentDefinitionSchema,
  agents,
  type AgentDefinition,
  type Db,
} from "@oc/shared";

export function parseIdAtVersion(idAtVersion: string): { id: string; version: string } {
  const at = idAtVersion.lastIndexOf("@");
  if (at <= 0 || at === idAtVersion.length - 1) {
    throw new Error(`Invalid idAtVersion: ${idAtVersion}`);
  }
  return {
    id: idAtVersion.slice(0, at),
    version: idAtVersion.slice(at + 1),
  };
}

export function formatIdAtVersion(id: string, version: string): string {
  return `${id}@${version}`;
}

export function registerAgent(db: Db, def: AgentDefinition): void {
  const parsed = AgentDefinitionSchema.parse(def);
  const now = new Date().toISOString();

  db.insert(agents)
    .values({
      id: parsed.id,
      version: parsed.version,
      definition: JSON.stringify(parsed),
      created_at: now,
    })
    .onConflictDoUpdate({
      target: [agents.id, agents.version],
      set: {
        definition: JSON.stringify(parsed),
        created_at: now,
      },
    })
    .run();
}

export function getAgent(db: Db, idAtVersion: string): AgentDefinition {
  const { id, version } = parseIdAtVersion(idAtVersion);
  const row = db
    .select()
    .from(agents)
    .where(and(eq(agents.id, id), eq(agents.version, version)))
    .all()[0];

  if (!row) {
    throw new Error(`Agent not found: ${idAtVersion}`);
  }

  return AgentDefinitionSchema.parse(JSON.parse(row.definition));
}

export function listAgents(db: Db): AgentDefinition[] {
  return db
    .select()
    .from(agents)
    .all()
    .map((row) => AgentDefinitionSchema.parse(JSON.parse(row.definition)));
}
