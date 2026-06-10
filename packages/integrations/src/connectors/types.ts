import type { IntegrationDefinition } from "@oc/shared";

export type ConnectorCallContext = {
  projectId: string;
  args: unknown;
  artifactsPath?: string;
};

export type ConnectorAdapter = {
  integrationId: string;
  callTool: (toolName: string, context: ConnectorCallContext) => Promise<unknown>;
};

export type ConnectorRegistry = Record<string, ConnectorAdapter>;

export function definitionKey(definition: Pick<IntegrationDefinition, "id" | "version">): string {
  return `${definition.id}@${definition.version}`;
}
