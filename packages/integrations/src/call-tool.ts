import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { emit, integrationToolCalls, redact, type Db, type EventEnvelope, type IntegrationDefinition } from "@oc/shared";
import { MOCK_CONNECTOR_ADAPTERS } from "./connectors/mock-adapters.js";
import { getConnectionForProject } from "./connection.js";
import { shouldUseOfflineFallback } from "./offline.js";
import { assertToolAllowed, getIntegrationById } from "./registry.js";
import { loadSkillPack, resolveSkillPacksRoot } from "./skill-pack-loader.js";
import { assertUntrustedResourceDoesNotOverridePolicy, wrapUntrustedResource } from "./untrusted.js";

export type IntegrationAuthorizeInput = {
  integrationId: string;
  toolName: string;
  permissions: string[];
};

export type CallIntegrationToolDeps = {
  db: Db;
  projectId: string;
  artifactsPath?: string;
  skillPacksRoot?: string;
  onEvent?: (envelope: EventEnvelope) => void;
  authorizeIntegrationWrite?: (
    input: IntegrationAuthorizeInput,
  ) => Promise<{ allow: boolean; reason?: string }>;
};

export type CallIntegrationToolInput = {
  integrationId: string;
  toolName: string;
  args?: unknown;
};

export type CallIntegrationToolResult = {
  mode: "remote" | "offline";
  output: unknown;
  artifactPath?: string;
  integrationToolCallId: string;
};

function isHighRiskTool(definition: IntegrationDefinition, toolName: string): boolean {
  if (definition.highRiskTools?.includes(toolName)) {
    return true;
  }
  return definition.permissions.some((permission) =>
    ["deploy", "secrets", "billing", "write"].includes(permission),
  );
}

function serializeOutput(output: unknown): string {
  if (typeof output === "string") {
    return output;
  }
  return JSON.stringify(output, null, 2);
}

function persistOfflineArtifact(
  deps: CallIntegrationToolDeps,
  packId: string,
  toolName: string,
  body: string,
): string | undefined {
  if (!deps.artifactsPath) {
    return undefined;
  }
  fs.mkdirSync(deps.artifactsPath, { recursive: true });
  const relativePath = path.join("integrations", `${packId}-${toolName}-offline.md`);
  const fullPath = path.join(deps.artifactsPath, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, body, "utf8");
  return `artifacts/${relativePath}`;
}

async function runOfflineFallback(
  deps: CallIntegrationToolDeps,
  definition: IntegrationDefinition,
  toolName: string,
  args: unknown,
): Promise<CallIntegrationToolResult> {
  const packId = definition.offlineFallbackSkillPackId;
  if (!packId) {
    throw new Error(`No offline fallback for integration: ${definition.id}`);
  }
  const pack = loadSkillPack(packId, deps.skillPacksRoot);
  const recipe = `# Offline fallback: ${definition.displayName}\n\nTool \`${toolName}\` was not executed remotely.\n\n## Manual follow-up\n\n- Review recipes in \`${pack.id}/recipes/\`\n- Args: \`${JSON.stringify(args ?? {})}\`\n- This run produced local guidance only; no remote effect occurred.\n`;
  const artifactPath = persistOfflineArtifact(deps, pack.id, toolName, recipe);
  const output = {
    mode: "offline",
    packId: pack.id,
    toolName,
    manualFollowUpRequired: true,
    artifactPath,
    message: `Offline Skill Pack ${pack.title} produced manual follow-up steps`,
  };
  return finalizeCall(deps, definition, toolName, "offline", output, artifactPath);
}

async function finalizeCall(
  deps: CallIntegrationToolDeps,
  definition: IntegrationDefinition,
  toolName: string,
  mode: "remote" | "offline",
  output: unknown,
  artifactPath?: string,
): Promise<CallIntegrationToolResult> {
  const toolCallId = randomUUID();
  const integrationToolCallId = randomUUID();
  const now = new Date().toISOString();
  const redacted = redact(serializeOutput(output));

  const startedEnvelope = emit(deps.db, {
    projectId: deps.projectId,
    payload: {
      type: "tool_call.started",
      projectId: deps.projectId,
      toolCallId,
      toolName: `${definition.id}:${toolName}`,
    },
  });
  deps.onEvent?.(startedEnvelope);

  const completedEnvelope = emit(deps.db, {
    projectId: deps.projectId,
    payload: {
      type: "tool_call.output",
      projectId: deps.projectId,
      toolCallId,
      output: artifactPath
        ? `${redacted.text}\n\n[artifact] ${artifactPath}`
        : redacted.text,
    },
  });
  deps.onEvent?.(completedEnvelope);

  deps.db
    .insert(integrationToolCalls)
    .values({
      id: integrationToolCallId,
      project_id: deps.projectId,
      integration_id: definition.id,
      tool_name: toolName,
      mode,
      status: "completed",
      event_id: completedEnvelope.eventId,
      output_ref: artifactPath ?? redacted.text.slice(0, 240),
      created_at: now,
    })
    .run();

  return {
    mode,
    output,
    artifactPath,
    integrationToolCallId,
  };
}

export async function callIntegrationTool(
  deps: CallIntegrationToolDeps,
  input: CallIntegrationToolInput,
): Promise<CallIntegrationToolResult> {
  const definition = getIntegrationById(input.integrationId);
  assertToolAllowed(definition, input.toolName);

  const connection = getConnectionForProject(deps.db, deps.projectId, definition.id);
  if (!connection || connection.status === "not_configured" || connection.status === "disabled") {
    throw new Error(`Integration not enabled for project: ${definition.id}`);
  }

  if (shouldUseOfflineFallback(definition, connection.status)) {
    return runOfflineFallback(deps, definition, input.toolName, input.args);
  }

  if (isHighRiskTool(definition, input.toolName)) {
    if (!deps.authorizeIntegrationWrite) {
      throw new Error(`High-risk integration tool requires authorization: ${input.toolName}`);
    }
    const decision = await deps.authorizeIntegrationWrite({
      integrationId: definition.id,
      toolName: input.toolName,
      permissions: definition.permissions,
    });
    if (!decision.allow) {
      throw new Error(decision.reason ?? `Integration tool rejected: ${input.toolName}`);
    }
  }

  const adapter = MOCK_CONNECTOR_ADAPTERS[definition.id];
  if (!adapter) {
    throw new Error(`No connector adapter registered for ${definition.id}`);
  }

  const raw = await adapter.callTool(input.toolName, {
    projectId: deps.projectId,
    args: input.args,
  });
  assertUntrustedResourceDoesNotOverridePolicy(raw);
  const output = wrapUntrustedResource(`${definition.id}:${input.toolName}`, raw);
  return finalizeCall(deps, definition, input.toolName, "remote", output);
}

export function getSkillPacksRootForProject(): string {
  return resolveSkillPacksRoot();
}
