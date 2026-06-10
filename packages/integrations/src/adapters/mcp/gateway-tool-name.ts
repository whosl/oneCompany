const GATEWAY_TOOL_RE = /^oc_([a-z0-9-]+)__(.+)$/;

export function formatGatewayToolName(integrationId: string, toolName: string): string {
  return `oc_${integrationId}__${toolName}`;
}

export function parseGatewayToolName(prefixed: string): {
  integrationId: string;
  toolName: string;
} {
  const match = GATEWAY_TOOL_RE.exec(prefixed.trim());
  if (!match) {
    throw new Error(
      `Invalid gateway tool name "${prefixed}" — expected oc_{integrationId}__{toolName}`,
    );
  }
  return {
    integrationId: match[1]!,
    toolName: match[2]!,
  };
}
