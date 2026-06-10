import {
  callIntegrationTool,
  enableIntegrationForProject,
  getConnectionForProject,
  type CallIntegrationToolDeps,
  type CallIntegrationToolResult,
} from "@oc/integrations";
import type { Db, IntegrationVerificationArtifact } from "@oc/shared";

export type IntegrationVerificationSummary = {
  label: "baseline" | "diagnostic";
  artifacts: IntegrationVerificationArtifact[];
  notes: string[];
};

function toArtifact(
  label: "baseline" | "diagnostic",
  toolName: string,
  result: CallIntegrationToolResult,
): IntegrationVerificationArtifact {
  const output =
    result.output && typeof result.output === "object"
      ? (result.output as { data?: { count?: number; errors?: string[] } }).data
      : undefined;
  const consoleErrorCount =
    toolName === "console_errors" && output && typeof output.count === "number"
      ? output.count
      : undefined;
  const summary =
    toolName === "console_errors"
      ? `${consoleErrorCount ?? 0} console error(s)`
      : result.artifactPath
        ? `saved ${result.artifactPath}`
        : `${result.mode} ${toolName}`;

  return {
    label,
    toolName,
    mode: result.mode,
    artifactPath: result.artifactPath,
    summary,
  };
}

async function ensureIntegrationEnabled(
  db: Db,
  projectId: string,
  integrationId: string,
  scopes: string[],
): Promise<void> {
  const existing = getConnectionForProject(db, projectId, integrationId);
  if (existing && existing.status !== "disabled" && existing.status !== "not_configured") {
    return;
  }
  await enableIntegrationForProject(db, { projectId, integrationId, scopes });
}

function shouldRunPlaywrightChecks(enabledIntegrationIds?: string[]): boolean {
  if (!enabledIntegrationIds || enabledIntegrationIds.length === 0) {
    return true;
  }
  return enabledIntegrationIds.includes("playwright");
}

export async function runPreviewIntegrationChecks(
  deps: {
    db: Db;
    projectId: string;
    callIntegration: CallIntegrationToolDeps;
    enabledIntegrationIds?: string[];
  },
  previewUrl: string,
  label: "baseline" | "diagnostic",
): Promise<IntegrationVerificationSummary | undefined> {
  if (!shouldRunPlaywrightChecks(deps.enabledIntegrationIds)) {
    const enabled = deps.enabledIntegrationIds ?? [];
    return {
      label,
      artifacts: [],
      notes: enabled.length
        ? [`Requirement integrations enabled: ${enabled.join(", ")} (preview checks skipped — no browser connector)`]
        : [],
    };
  }

  await ensureIntegrationEnabled(deps.db, deps.projectId, "playwright", ["read", "network"]);

  const screenshot = await callIntegrationTool(deps.callIntegration, {
    integrationId: "playwright",
    toolName: "screenshot",
    args: { previewUrl, label },
  });

  const consoleErrors = await callIntegrationTool(deps.callIntegration, {
    integrationId: "playwright",
    toolName: "console_errors",
    args: { previewUrl },
  });

  const artifacts = [
    toArtifact(label, "screenshot", screenshot),
    toArtifact(label, "console_errors", consoleErrors),
  ];

  const notes = [
    `Preview ${label} screenshot: ${screenshot.artifactPath ?? screenshot.mode}`,
    `Preview ${label} console errors: ${
      artifacts.find((item) => item.toolName === "console_errors")?.summary ?? "checked"
    }`,
  ];

  return { label, artifacts, notes };
}
