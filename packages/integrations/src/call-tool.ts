import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { emit, integrationToolCalls, redact, type Db, type EventEnvelope, type IntegrationDefinition } from "@oc/shared";
import { resolveAdapter } from "./adapters/resolver.js";
import { shouldFallbackForMissingSecrets } from "./adapters/readiness.js";
import { getConnectionForProject } from "./connection.js";
import {
  isIntegrationAuthorizePending,
  type IntegrationAuthorizeResult,
} from "./gate-protocol.js";
import { shouldUseOfflineFallback } from "./offline.js";
import { assertToolAllowed, getIntegrationById } from "./registry.js";
import { loadSkillPack, resolveSkillPacksRoot } from "./skill-pack-loader.js";
import { assertUntrustedResourceDoesNotOverridePolicy, wrapUntrustedResource } from "./untrusted.js";

export type IntegrationCaller = "ui" | "workflow" | "agent" | "opencode";

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
  caller?: IntegrationCaller;
  onEvent?: (envelope: EventEnvelope) => void;
  authorizeIntegrationWrite?: (
    input: IntegrationAuthorizeInput,
  ) => Promise<IntegrationAuthorizeResult>;
};

export type CallIntegrationToolInput = {
  integrationId: string;
  toolName: string;
  args?: unknown;
};

export type CallIntegrationToolResult = {
  mode: "remote" | "offline" | "pending";
  output: unknown;
  artifactPath?: string;
  integrationToolCallId: string;
  gateId?: string;
};

function shouldEmitToolEvents(deps: CallIntegrationToolDeps): boolean {
  return deps.caller !== "opencode";
}

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
  reason?: string,
): Promise<CallIntegrationToolResult> {
  const packId = definition.offlineFallbackSkillPackId;
  if (!packId) {
    throw new Error(`No offline fallback for integration: ${definition.id}`);
  }
  const pack = loadSkillPack(packId, deps.skillPacksRoot);
  const reasonLine = reason ? `\n\nReason: ${reason}` : "";
  const recipe = `# Offline fallback: ${definition.displayName}\n\nTool \`${toolName}\` was not executed remotely.${reasonLine}\n\n## Manual follow-up\n\n- Review recipes in \`${pack.id}/recipes/\`\n- Args: \`${JSON.stringify(args ?? {})}\`\n- This run produced local guidance only; no remote effect occurred.\n`;
  const artifactPath = persistOfflineArtifact(deps, pack.id, toolName, recipe);
  const output = {
    mode: "offline",
    packId: pack.id,
    toolName,
    manualFollowUpRequired: true,
    artifactPath,
    message: `Offline Skill Pack ${pack.title} produced manual follow-up steps`,
    reason,
  };
  return finalizeCall(deps, definition, toolName, "offline", output, artifactPath);
}

async function finalizeCall(
  deps: CallIntegrationToolDeps,
  definition: IntegrationDefinition,
  toolName: string,
  mode: "remote" | "offline" | "pending",
  output: unknown,
  artifactPath?: string,
  gateId?: string,
): Promise<CallIntegrationToolResult> {
  const toolCallId = randomUUID();
  const integrationToolCallId = randomUUID();
  const now = new Date().toISOString();
  const redacted = redact(serializeOutput(output));
  const emitEvents = shouldEmitToolEvents(deps);
  let eventId: string | undefined;

  if (emitEvents) {
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
    eventId = completedEnvelope.eventId;
  }

  deps.db
    .insert(integrationToolCalls)
    .values({
      id: integrationToolCallId,
      project_id: deps.projectId,
      integration_id: definition.id,
      tool_name: toolName,
      mode: mode === "pending" ? "remote" : mode,
      status: mode === "pending" ? "pending" : "completed",
      event_id: eventId ?? null,
      output_ref: artifactPath ?? redacted.text.slice(0, 240),
      created_at: now,
    })
    .run();

  return {
    mode,
    output,
    artifactPath,
    integrationToolCallId,
    gateId,
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

  if (shouldFallbackForMissingSecrets(definition)) {
    return runOfflineFallback(
      deps,
      definition,
      input.toolName,
      input.args,
      "Required secrets are not configured for real adapter mode",
    );
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
    if (isIntegrationAuthorizePending(decision)) {
      return finalizeCall(
        deps,
        definition,
        input.toolName,
        "pending",
        {
          pending: true,
          gateId: decision.gateId,
          message:
            decision.message ??
            `Human gate required before ${definition.id}:${input.toolName} can run`,
        },
        undefined,
        decision.gateId,
      );
    }
    if (!decision.allow) {
      throw new Error(decision.reason ?? `Integration tool rejected: ${input.toolName}`);
    }
  }

  const adapter = resolveAdapter(definition);
  const raw = await adapter.callTool(input.toolName, {
    projectId: deps.projectId,
    args: input.args,
    artifactsPath: deps.artifactsPath,
  });
  assertUntrustedResourceDoesNotOverridePolicy(raw);
  const output = wrapUntrustedResource(`${definition.id}:${input.toolName}`, raw);
  const artifactPath = extractArtifactPath(raw);
  return finalizeCall(deps, definition, input.toolName, "remote", output, artifactPath);
}

function extractArtifactPath(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const pathValue = (raw as { path?: unknown }).path;
  return typeof pathValue === "string" && pathValue.startsWith("artifacts/") ? pathValue : undefined;
}

export function getSkillPacksRootForProject(): string {
  return resolveSkillPacksRoot();
}
