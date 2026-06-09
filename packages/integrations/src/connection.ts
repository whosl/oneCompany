import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  integrationConnections,
  type Db,
  type IntegrationConnection,
  type IntegrationConnectionStatus,
} from "@oc/shared";
import { getIntegrationById } from "./registry.js";
import { definitionKey } from "./connectors/types.js";
import { isOfflineModeEnabled } from "./offline.js";

function toConnection(row: typeof integrationConnections.$inferSelect): IntegrationConnection {
  return {
    id: row.id,
    integrationId: row.integration_id,
    integrationVersion: row.integration_version,
    projectId: row.project_id,
    accountLabel: row.account_label,
    scopes: JSON.parse(row.scopes_json) as string[],
    status: row.status as IntegrationConnectionStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getConnectionForProject(
  db: Db,
  projectId: string,
  integrationId: string,
): IntegrationConnection | null {
  const row = db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.project_id, projectId),
        eq(integrationConnections.integration_id, integrationId),
      ),
    )
    .all()[0];
  return row ? toConnection(row) : null;
}

export function listConnectionsForProject(db: Db, projectId: string): IntegrationConnection[] {
  return db
    .select()
    .from(integrationConnections)
    .where(eq(integrationConnections.project_id, projectId))
    .all()
    .map(toConnection);
}

export async function enableIntegrationForProject(
  db: Db,
  input: {
    projectId: string;
    integrationId: string;
    scopes: string[];
    accountLabel?: string;
  },
): Promise<IntegrationConnection> {
  const definition = getIntegrationById(input.integrationId);
  const now = new Date().toISOString();
  const status: IntegrationConnectionStatus = isOfflineModeEnabled()
    ? "offline_fallback"
    : "connected";

  const existing = getConnectionForProject(db, input.projectId, input.integrationId);
  if (existing) {
    db.update(integrationConnections)
      .set({
        scopes_json: JSON.stringify(input.scopes),
        account_label: input.accountLabel ?? existing.accountLabel,
        status,
        integration_version: definition.version,
        updated_at: now,
      })
      .where(eq(integrationConnections.id, existing.id))
      .run();
    return {
      ...existing,
      scopes: input.scopes,
      accountLabel: input.accountLabel ?? existing.accountLabel,
      status,
      integrationVersion: definition.version,
      updatedAt: now,
    };
  }

  const id = randomUUID();
  db.insert(integrationConnections)
    .values({
      id,
      project_id: input.projectId,
      integration_id: definition.id,
      integration_version: definition.version,
      account_label: input.accountLabel ?? `${definition.displayName} connection`,
      scopes_json: JSON.stringify(input.scopes),
      status,
      created_at: now,
      updated_at: now,
    })
    .run();

  return {
    id,
    integrationId: definition.id,
    integrationVersion: definition.version,
    projectId: input.projectId,
    accountLabel: input.accountLabel ?? `${definition.displayName} connection`,
    scopes: input.scopes,
    status,
    createdAt: now,
    updatedAt: now,
  };
}

export function resolveIntegrationKey(integrationId: string): string {
  const definition = getIntegrationById(integrationId);
  return definitionKey(definition);
}
