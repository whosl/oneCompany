import type { IntegrationDefinition } from "@oc/shared";
import { IntegrationDefinitionSchema } from "@oc/shared";
import { P1_INTEGRATION_DEFINITIONS } from "./p1-definitions.js";
import { definitionKey } from "./connectors/types.js";

const registry = new Map<string, IntegrationDefinition>();

export function registerIntegration(definition: IntegrationDefinition): void {
  const parsed = IntegrationDefinitionSchema.parse(definition);
  registry.set(definitionKey(parsed), parsed);
}

export function getIntegration(idAtVersion: string): IntegrationDefinition {
  const definition = registry.get(idAtVersion);
  if (!definition) {
    throw new Error(`Integration not registered: ${idAtVersion}`);
  }
  return definition;
}

export function getIntegrationById(integrationId: string): IntegrationDefinition {
  const match = [...registry.values()].find((row) => row.id === integrationId);
  if (!match) {
    throw new Error(`Integration not registered: ${integrationId}`);
  }
  return match;
}

export function listIntegrations(): IntegrationDefinition[] {
  return [...registry.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function assertToolAllowed(definition: IntegrationDefinition, toolName: string): void {
  if (!definition.toolAllowlist.includes(toolName)) {
    throw new Error(`Tool not in allowlist for ${definition.id}: ${toolName}`);
  }
}

export function resetIntegrationRegistryForTests(): void {
  registry.clear();
}

export function seedDefaultIntegrations(): void {
  registry.clear();
  for (const definition of P1_INTEGRATION_DEFINITIONS) {
    registerIntegration(definition);
  }
}

seedDefaultIntegrations();
