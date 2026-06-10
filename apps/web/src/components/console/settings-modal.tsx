"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { EnvironmentReadiness } from "@oc/shared";
import {
  Check,
  CircleAlert,
  Database,
  FolderCog,
  KeyRound,
  Network,
  PlugZap,
  ShieldCheck,
  TerminalSquare,
  TestTube2,
  X,
} from "lucide-react";
import { consoleApi, integrationsApi } from "@/lib/api";
import type { IntegrationStatusSnapshot } from "@oc/shared";
import {
  UiDialog,
  UiEmptyState,
  UiStatusPill,
} from "@/components/ui-v2/primitives";

function ReadinessRow({
  label,
  ready,
  detail,
}: {
  label: string;
  ready: boolean;
  detail?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <div className="text-sm text-[var(--oc-text-primary)]">{label}</div>
        {detail ? <div className="truncate text-xs text-[var(--oc-text-muted)]">{detail}</div> : null}
      </div>
      <UiStatusPill tone={ready ? "success" : "danger"} label={ready ? "Ready" : "Missing"} />
    </div>
  );
}

export function SettingsModal({
  open,
  onClose,
  projectId,
}: {
  open: boolean;
  onClose: () => void;
  projectId?: string;
}) {
  const [readiness, setReadiness] = useState<EnvironmentReadiness | null>(null);
  const [adapterMode, setAdapterMode] = useState<"mock" | "real">("mock");
  const [gateMode, setGateMode] = useState<"sync" | "async">("sync");
  const [projectIntegrations, setProjectIntegrations] = useState<IntegrationStatusSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);
    void Promise.all([
      consoleApi.getEnvironmentReadiness(),
      integrationsApi.listDefinitions(),
      projectId ? integrationsApi.listProjectStatus(projectId) : Promise.resolve(null),
    ])
      .then(([nextReadiness, definitions, projectStatus]) => {
        if (!active) return;
        setReadiness(nextReadiness);
        setAdapterMode(definitions.gateway?.adapterMode ?? "mock");
        setGateMode(definitions.gateway?.gateMode ?? "sync");
        setProjectIntegrations(projectStatus?.integrations ?? []);
      })
      .catch((loadError: unknown) =>
        active
          ? setError(
              loadError instanceof Error ? loadError.message : "Failed to load environment readiness",
            )
          : undefined,
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, projectId]);

  const engine = readiness?.engine;
  const workflowMissing = engine ? !engine.workflowLlmReady : !readiness?.apiKeyReady;
  const opencodeCliMissing = engine ? !engine.opencodeCliReady : false;
  const opencodeModelMissing = engine ? !engine.opencodeModelReady : false;
  const stubModes = readiness?.degradedModes ?? [];
  const engineDegraded = workflowMissing || opencodeCliMissing || opencodeModelMissing;
  const mockModeActive = stubModes.includes("stub_engine") || stubModes.includes("testing_fixture");
  const readyCheckCount = readiness
    ? Object.values(readiness.checks).filter(Boolean).length
    : 0;
  const totalCheckCount = readiness ? Object.keys(readiness.checks).length : 0;
  const connectedCount = projectIntegrations.filter((row) => row.status === "connected").length;
  const offlineCount = projectIntegrations.filter((row) => row.status === "offline_fallback").length;
  const needsSetupCount = projectIntegrations.filter(
    (row) => row.status === "not_configured" || row.status === "disabled",
  ).length;

  return (
    <UiDialog
      open={open}
      onClose={onClose}
      title="Settings"
      description="Global environment readiness and runtime policy"
      className="max-w-4xl"
      testId="settings-modal"
    >
      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? <UiEmptyState title="Loading environment readiness" /> : null}
        {error ? (
          <div className="m-4 border border-[var(--oc-status-danger)]/45 bg-[var(--oc-status-danger)]/10 p-3 text-sm text-[var(--oc-status-danger)] sm:m-5">
            {error}
          </div>
        ) : null}

        {!loading && readiness ? (
          <div className="divide-y divide-[var(--oc-border-muted)]">
            {engineDegraded ? (
              <section
                className="flex items-start gap-3 bg-[var(--oc-status-warning)]/10 px-4 py-4 sm:px-5"
                data-testid="engine-degraded-notice"
              >
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-[var(--oc-status-warning)]" />
                <div>
                  <h3 className="text-sm font-semibold text-[var(--oc-text-primary)]">
                    Engine degraded (§12)
                  </h3>
                  <ul className="mt-2 space-y-1.5 text-xs text-[var(--oc-text-muted)]">
                    {workflowMissing ? (
                      <li>
                        Workflow agents need <code>OC_LLM_API_KEY</code> or <code>OPENAI_API_KEY</code>.
                        Requirement and planning steps use mock data until configured; they never silently pass.
                      </li>
                    ) : null}
                    {opencodeCliMissing ? (
                      <li>
                        Slice development needs the <code>opencode</code> CLI on PATH.
                      </li>
                    ) : null}
                    {opencodeModelMissing ? (
                      <li>
                        Opencode model authentication is missing from the local provider configuration.
                      </li>
                    ) : null}
                  </ul>
                </div>
              </section>
            ) : null}

            {mockModeActive ? (
              <section
                className="flex items-start gap-3 bg-[var(--oc-status-danger)]/10 px-4 py-4 sm:px-5"
                data-testid="mock-mode-notice"
              >
                <TestTube2 className="mt-0.5 size-4 shrink-0 text-[var(--oc-status-danger)]" />
                <div>
                  <h3 className="text-sm font-semibold">Mock or fixture mode active</h3>
                  <ul className="mt-2 space-y-1 text-xs text-[var(--oc-text-muted)]">
                    {stubModes.includes("stub_engine") ? (
                      <li>
                        <code>OC_USE_STUB_ENGINE=1</code> bypasses authoritative checks and permission gates.
                      </li>
                    ) : null}
                    {stubModes.includes("testing_fixture") ? (
                      <li>
                        <code>OC_TESTING_FIXTURE=1</code> simulates final test suite success.
                      </li>
                    ) : null}
                  </ul>
                </div>
              </section>
            ) : null}

            <section className="grid grid-cols-1 lg:grid-cols-2">
              <div className="border-b border-[var(--oc-border-muted)] p-4 sm:p-5 lg:border-b-0 lg:border-r">
                <div className="mb-3 flex items-center gap-2">
                  <TerminalSquare className="size-4 text-[var(--oc-accent-primary)]" />
                  <h3 className="text-sm font-semibold">Engine readiness</h3>
                </div>
                <div className="divide-y divide-[var(--oc-border-muted)] border-y border-[var(--oc-border-muted)]">
                  {engine ? (
                    <>
                      <ReadinessRow label="Workflow LLM" ready={engine.workflowLlmReady} />
                      <ReadinessRow label="Opencode CLI" ready={engine.opencodeCliReady} />
                      <ReadinessRow label="Opencode model" ready={engine.opencodeModelReady} />
                    </>
                  ) : (
                    <ReadinessRow label="API key" ready={readiness.apiKeyReady} />
                  )}
                  <ReadinessRow
                    label="Tunnel"
                    ready={readiness.tunnelConfigured}
                    detail={readiness.tunnelConfigured ? "Configured" : "Not configured"}
                  />
                </div>
              </div>

              <div className="p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="size-4 text-[var(--oc-status-success)]" />
                    <h3 className="text-sm font-semibold">Environment checks</h3>
                  </div>
                  <UiStatusPill
                    tone={readyCheckCount === totalCheckCount ? "success" : "warning"}
                    label={`${readyCheckCount} / ${totalCheckCount}`}
                  />
                </div>
                <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-[var(--oc-border-muted)] bg-[var(--oc-border-muted)] sm:grid-cols-3">
                  {Object.entries(readiness.checks).map(([name, ok]) => (
                    <div
                      key={name}
                      className="flex items-center gap-2 bg-[var(--oc-surface-base)] px-3 py-2.5 text-sm"
                    >
                      {ok ? (
                        <Check className="size-4 text-[var(--oc-status-success)]" />
                      ) : (
                        <X className="size-4 text-[var(--oc-status-danger)]" />
                      )}
                      <span>
                        {name}: {ok ? "ok" : "missing"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2">
              <div className="border-b border-[var(--oc-border-muted)] p-4 sm:p-5 lg:border-b-0 lg:border-r">
                <div className="mb-3 flex items-center gap-2">
                  <FolderCog className="size-4 text-[var(--oc-status-info)]" />
                  <h3 className="text-sm font-semibold">Workspace paths</h3>
                </div>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-xs text-[var(--oc-text-muted)]">Workspace root</dt>
                    <dd className="mt-1 break-all rounded-md bg-[var(--oc-surface-raised)] p-2 font-mono text-xs">
                      {readiness.workspaceRoot}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--oc-text-muted)]">Generated projects</dt>
                    <dd className="mt-1 break-all rounded-md bg-[var(--oc-surface-raised)] p-2 font-mono text-xs">
                      {readiness.generatedProjectsRoot}
                    </dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1 text-xs text-[var(--oc-text-muted)]">
                      <Database className="size-3" /> Database
                    </dt>
                    <dd className="mt-1 break-all rounded-md bg-[var(--oc-surface-raised)] p-2 font-mono text-xs">
                      {readiness.databasePath}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="p-4 sm:p-5">
                <div className="mb-3 flex items-center gap-2">
                  <KeyRound className="size-4 text-[var(--oc-status-warning)]" />
                  <h3 className="text-sm font-semibold">Runtime policies</h3>
                </div>
                <ul className="divide-y divide-[var(--oc-border-muted)] border-y border-[var(--oc-border-muted)]">
                  {readiness.policies.map((policy) => (
                    <li key={policy} className="flex items-start gap-2 py-2.5 text-sm">
                      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--oc-status-success)]" />
                      <span>{policy}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section
              className="grid grid-cols-1 border-b border-[var(--oc-border-muted)] lg:grid-cols-2"
              data-testid="settings-integration-gateway"
            >
              <div className="border-b border-[var(--oc-border-muted)] p-4 sm:p-5 lg:border-b-0 lg:border-r">
                <div className="mb-3 flex items-center gap-2">
                  <Network className="size-4 text-[var(--oc-accent-primary)]" />
                  <h3 className="text-sm font-semibold">Integration gateway</h3>
                </div>
                <dl className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[var(--oc-text-muted)]">Adapter mode</dt>
                    <dd>
                      <UiStatusPill
                        tone={adapterMode === "real" ? "success" : "warning"}
                        label={adapterMode === "real" ? "Real adapters" : "Mock adapters"}
                      />
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[var(--oc-text-muted)]">Gate mode</dt>
                    <dd className="font-mono text-xs">{gateMode}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs text-[var(--oc-text-muted)]">
                  High-risk integration tools create a human gate with integration id and tool name in
                  the Stream.
                </p>
              </div>
              <div className="p-4 sm:p-5">
                <div className="mb-3 flex items-center gap-2">
                  <PlugZap className="size-4 text-[var(--oc-accent-primary)]" />
                  <h3 className="text-sm font-semibold">Project connectors</h3>
                </div>
                {projectId ? (
                  <dl className="grid grid-cols-3 gap-3 text-sm">
                    <div className="rounded-md border border-[var(--oc-border-muted)] bg-[var(--oc-surface-raised)] p-3 text-center">
                      <dt className="text-xs text-[var(--oc-text-muted)]">Connected</dt>
                      <dd className="mt-1 text-lg font-semibold">{connectedCount}</dd>
                    </div>
                    <div className="rounded-md border border-[var(--oc-border-muted)] bg-[var(--oc-surface-raised)] p-3 text-center">
                      <dt className="text-xs text-[var(--oc-text-muted)]">Offline</dt>
                      <dd className="mt-1 text-lg font-semibold">{offlineCount}</dd>
                    </div>
                    <div className="rounded-md border border-[var(--oc-border-muted)] bg-[var(--oc-surface-raised)] p-3 text-center">
                      <dt className="text-xs text-[var(--oc-text-muted)]">Needs setup</dt>
                      <dd className="mt-1 text-lg font-semibold">{needsSetupCount}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="text-xs text-[var(--oc-text-muted)]">
                    Open Settings from a project console to see connector counts for that project.
                  </p>
                )}
              </div>
            </section>

            <section
              className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
              data-testid="settings-integrations-link"
            >
              <div className="flex items-start gap-3">
                <PlugZap className="mt-0.5 size-4 shrink-0 text-[var(--oc-accent-primary)]" />
                <div>
                  <h3 className="text-sm font-semibold">Integrations</h3>
                  <p className="mt-1 text-xs text-[var(--oc-text-muted)]">
                    Connector readiness, project scopes, offline Skill Packs and secret names only.
                  </p>
                </div>
              </div>
              <Link
                href={projectId ? `/integrations?projectId=${projectId}` : "/integrations"}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-[var(--oc-accent-primary)] bg-[var(--oc-accent-primary)] px-3 text-sm font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--oc-border-active)]/35"
                onClick={onClose}
              >
                <Network className="size-4" />
                Open integrations
              </Link>
            </section>
          </div>
        ) : null}
      </div>
    </UiDialog>
  );
}
