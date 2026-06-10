"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type {
  IntegrationDefinition,
  IntegrationStatusSnapshot,
  SkillPack,
} from "@oc/shared";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  KeyRound,
  PackageOpen,
  PlugZap,
  RefreshCw,
  Shield,
  TestTube2,
  Wrench,
  X,
} from "lucide-react";
import { integrationsApi } from "@/lib/api";
import {
  UiButton,
  UiCodeBlock,
  UiEmptyState,
  UiSelect,
  UiStatusPill,
  UiTextarea,
  type UiStatusTone,
} from "@/components/ui-v2/primitives";
import { cn } from "@/lib/utils";

type IntegrationFilter = "All" | "Connected" | "Needs setup";

function statusLabel(status: IntegrationStatusSnapshot["status"]): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "offline_fallback":
      return "Offline fallback";
    case "expired":
      return "Expired";
    case "disabled":
      return "Disabled";
    default:
      return "Not configured";
  }
}

function statusTone(status: IntegrationStatusSnapshot["status"]): UiStatusTone {
  if (status === "connected") return "success";
  if (status === "offline_fallback") return "warning";
  if (status === "expired") return "danger";
  return "neutral";
}

function riskTone(risk: IntegrationDefinition["riskLevel"]): UiStatusTone {
  if (risk === "high") return "danger";
  if (risk === "medium") return "warning";
  return "success";
}

function defaultStatus(definition: IntegrationDefinition): IntegrationStatusSnapshot {
  return {
    integrationId: definition.id,
    displayName: definition.displayName,
    version: definition.version,
    status: "not_configured",
    secretReadiness: definition.secretRefs.map((ref) => ({ ref, configured: false })),
    offlineFallbackSkillPackId: definition.offlineFallbackSkillPackId,
    scopes: [],
  };
}

export function IntegrationsView({ projectId }: { projectId: string }) {
  const [definitions, setDefinitions] = useState<IntegrationDefinition[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationStatusSnapshot[]>([]);
  const [skillPacks, setSkillPacks] = useState<SkillPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<IntegrationFilter>("All");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [scopeSelection, setScopeSelection] = useState<Record<string, string[]>>({});
  const [toolSelection, setToolSelection] = useState<Record<string, string>>({});
  const [argsById, setArgsById] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<Record<string, string>>({});
  const [actionResult, setActionResult] = useState<Record<string, string>>({});
  const [adapterMode, setAdapterMode] = useState<"mock" | "real">("mock");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [definitionResult, packsResult, statusResult] = await Promise.all([
        integrationsApi.listDefinitions(),
        integrationsApi.listSkillPacks(),
        projectId ? integrationsApi.listProjectStatus(projectId) : Promise.resolve(null),
      ]);
      const nextIntegrations =
        statusResult?.integrations ?? definitionResult.integrations.map(defaultStatus);
      setDefinitions(definitionResult.integrations);
      setAdapterMode(definitionResult.gateway?.adapterMode ?? "mock");
      setSkillPacks(packsResult.skillPacks);
      setIntegrations(nextIntegrations);
      setScopeSelection((current) => {
        const next = { ...current };
        for (const definition of definitionResult.integrations) {
          const status = nextIntegrations.find((item) => item.integrationId === definition.id);
          next[definition.id] = status?.scopes.length ? status.scopes : [...definition.permissions];
        }
        return next;
      });
      setToolSelection((current) => {
        const next = { ...current };
        for (const definition of definitionResult.integrations) {
          next[definition.id] ??= definition.toolAllowlist[0] ?? "";
        }
        return next;
      });
      setArgsById((current) => {
        const next = { ...current };
        for (const definition of definitionResult.integrations) next[definition.id] ??= "{}";
        return next;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load integrations");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const statusById = useMemo(
    () => new Map(integrations.map((integration) => [integration.integrationId, integration])),
    [integrations],
  );

  const visibleDefinitions = useMemo(() => {
    if (filter === "All") return definitions;
    return definitions.filter((definition) => {
      const status = statusById.get(definition.id)?.status ?? "not_configured";
      if (filter === "Connected") return status === "connected" || status === "offline_fallback";
      return status === "not_configured" || status === "expired" || status === "disabled";
    });
  }, [definitions, filter, statusById]);

  function toggleScope(integrationId: string, scope: string) {
    setScopeSelection((current) => {
      const selected = current[integrationId] ?? [];
      return {
        ...current,
        [integrationId]: selected.includes(scope)
          ? selected.filter((item) => item !== scope)
          : [...selected, scope],
      };
    });
  }

  async function enableIntegration(definition: IntegrationDefinition) {
    if (!projectId) return;
    setPendingId(definition.id);
    setActionError((current) => ({ ...current, [definition.id]: "" }));
    try {
      await integrationsApi.enable(projectId, definition.id, scopeSelection[definition.id] ?? []);
      const result = await integrationsApi.listProjectStatus(projectId);
      setIntegrations(result.integrations);
      setActionResult((current) => ({
        ...current,
        [definition.id]: "Integration enabled for this project.",
      }));
    } catch (enableError) {
      setActionError((current) => ({
        ...current,
        [definition.id]: enableError instanceof Error ? enableError.message : "Failed to enable integration",
      }));
    } finally {
      setPendingId(null);
    }
  }

  async function callTool(definition: IntegrationDefinition) {
    if (!projectId) return;
    const toolName = toolSelection[definition.id] ?? definition.toolAllowlist[0];
    if (!toolName) return;
    let args: unknown;
    try {
      args = JSON.parse(argsById[definition.id] || "{}");
    } catch {
      setActionError((current) => ({
        ...current,
        [definition.id]: "Tool arguments must be valid JSON.",
      }));
      return;
    }

    setPendingId(definition.id);
    setActionError((current) => ({ ...current, [definition.id]: "" }));
    try {
      const result = await integrationsApi.callTool(projectId, definition.id, toolName, args);
      setActionResult((current) => ({
        ...current,
        [definition.id]: JSON.stringify(
          {
            mode: result.mode,
            artifactPath: result.artifactPath,
            output: result.output,
          },
          null,
          2,
        ),
      }));
    } catch (callError) {
      setActionError((current) => ({
        ...current,
        [definition.id]: callError instanceof Error ? callError.message : "Integration call failed",
      }));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--oc-app-bg)] text-[var(--oc-text-primary)]" data-testid="integrations-page">
      <header className="border-b border-[var(--oc-border-muted)] bg-[var(--oc-surface-base)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--oc-accent-primary)] text-white">
              <PlugZap className="size-4" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Integrations</h1>
              <p className="mt-0.5 text-xs text-[var(--oc-text-muted)]">
                Connector readiness, project scopes and offline Skill Pack fallbacks
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <UiButton onClick={() => void load()} disabled={loading}>
              <RefreshCw />
              Refresh
            </UiButton>
            <Link
              href={projectId ? `/projects/${projectId}` : "/"}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[var(--oc-border-muted)] bg-[var(--oc-surface-base)] px-3 text-sm font-medium hover:bg-[var(--oc-surface-raised)]"
            >
              <ArrowLeft className="size-4" />
              Back to console
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        <section className="flex flex-col gap-3 border-b border-[var(--oc-border-muted)] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm font-semibold">Connector directory</div>
            {projectId ? (
              <p className="mt-1 text-xs text-[var(--oc-text-muted)]" data-testid="integrations-project-scope">
                Project scope: <code>{projectId}</code>
              </p>
            ) : (
              <p className="mt-1 text-xs text-[var(--oc-status-warning)]">
                Open Integrations from a project Settings panel to manage connections.
              </p>
            )}
          </div>
          <div className="flex gap-1 rounded-md border border-[var(--oc-border-muted)] bg-[var(--oc-surface-raised)] p-1">
            {(["All", "Connected", "Needs setup"] as const).map((item) => (
              <button
                key={item}
                type="button"
                className={cn(
                  "h-8 rounded px-3 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--oc-border-active)]/35",
                  filter === item
                    ? "bg-[var(--oc-surface-base)] text-[var(--oc-accent-primary)] shadow-sm"
                    : "text-[var(--oc-text-muted)]",
                )}
                onClick={() => setFilter(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </section>

        {loading ? <UiEmptyState title="Loading integrations" /> : null}
        {error ? (
          <div className="mt-5 border border-[var(--oc-status-danger)]/45 bg-[var(--oc-status-danger)]/10 p-3 text-sm text-[var(--oc-status-danger)]">
            {error}
          </div>
        ) : null}

        {!loading && !error ? (
          <>
            <div className="mt-5 divide-y divide-[var(--oc-border-muted)] border-y border-[var(--oc-border-muted)]">
              {visibleDefinitions.map((definition) => {
                const integration = statusById.get(definition.id) ?? defaultStatus(definition);
                const expanded = expandedId === definition.id;
                const connected =
                  integration.status === "connected" || integration.status === "offline_fallback";
                const selectedScopes = scopeSelection[definition.id] ?? [];
                return (
                  <section
                    key={definition.id}
                    data-testid={`integration-card-${definition.id}`}
                    className="bg-[var(--oc-surface-base)]"
                  >
                    <button
                      type="button"
                      className="flex w-full flex-col gap-3 px-3 py-4 text-left outline-none hover:bg-[var(--oc-surface-raised)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--oc-border-active)]/35 sm:flex-row sm:items-center sm:justify-between sm:px-4"
                      onClick={() => setExpandedId(expanded ? null : definition.id)}
                      aria-expanded={expanded}
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-[var(--oc-border-muted)] bg-[var(--oc-surface-raised)]">
                          <Wrench className="size-4 text-[var(--oc-accent-primary)]" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-sm font-semibold">{definition.displayName}</h2>
                            <UiStatusPill
                              tone={statusTone(integration.status)}
                              label={statusLabel(integration.status)}
                            />
                            {adapterMode === "mock" ? (
                              <UiStatusPill tone="info" label="Simulated adapter" />
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-[var(--oc-text-muted)]">{definition.description}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <UiStatusPill tone={riskTone(definition.riskLevel)} label={`${definition.riskLevel} risk`} />
                        <span className="font-mono text-xs text-[var(--oc-text-muted)]">
                          {definition.protocol} / {definition.mode}
                        </span>
                        {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                      </div>
                    </button>

                    {expanded ? (
                      <div className="border-t border-[var(--oc-border-muted)] bg-[var(--oc-surface-raised)]/50 px-3 py-4 sm:px-4">
                        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.15fr]">
                          <div className="space-y-5">
                            <section>
                              <div className="mb-2 flex items-center gap-2">
                                <Shield className="size-4 text-[var(--oc-status-warning)]" />
                                <h3 className="text-sm font-semibold">Project scopes</h3>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {definition.permissions.map((permission) => (
                                  <label
                                    key={permission}
                                    className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[var(--oc-border-muted)] bg-[var(--oc-surface-base)] px-2.5 py-1.5 text-xs"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedScopes.includes(permission)}
                                      onChange={() => toggleScope(definition.id, permission)}
                                      disabled={!projectId || pendingId === definition.id}
                                    />
                                    {permission}
                                  </label>
                                ))}
                              </div>
                              <UiButton
                                className="mt-3"
                                variant={connected ? "secondary" : "primary"}
                                onClick={() => void enableIntegration(definition)}
                                disabled={!projectId || pendingId === definition.id || selectedScopes.length === 0}
                              >
                                <PlugZap />
                                {connected ? "Update connection" : "Enable for project"}
                              </UiButton>
                            </section>

                            <section>
                              <div className="mb-2 flex items-center gap-2">
                                <KeyRound className="size-4 text-[var(--oc-accent-primary)]" />
                                <h3 className="text-sm font-semibold">Secret readiness</h3>
                              </div>
                              {integration.secretReadiness.length ? (
                                <ul className="divide-y divide-[var(--oc-border-muted)] border-y border-[var(--oc-border-muted)]">
                                  {integration.secretReadiness.map((secret) => (
                                    <li
                                      key={secret.ref}
                                      className="flex items-center justify-between gap-3 py-2 text-sm"
                                      data-testid={`secret-readiness-${secret.ref}`}
                                    >
                                      <code>{secret.ref}</code>
                                      <span className="inline-flex items-center gap-1 text-xs text-[var(--oc-text-muted)]">
                                        {secret.configured ? (
                                          <Check className="size-3.5 text-[var(--oc-status-success)]" />
                                        ) : (
                                          <X className="size-3.5 text-[var(--oc-status-danger)]" />
                                        )}
                                        {secret.configured ? "configured" : "missing"}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-sm text-[var(--oc-text-muted)]">No secrets required.</p>
                              )}
                            </section>

                            {integration.offlineFallbackSkillPackId ? (
                              <section className="flex items-start gap-3 border border-[var(--oc-status-warning)]/45 bg-[var(--oc-status-warning)]/10 p-3">
                                <PackageOpen className="mt-0.5 size-4 shrink-0 text-[var(--oc-status-warning)]" />
                                <div>
                                  <h3 className="text-sm font-semibold">Offline fallback</h3>
                                  <p className="mt-1 font-mono text-xs text-[var(--oc-text-muted)]">
                                    {integration.offlineFallbackSkillPackId}
                                  </p>
                                </div>
                              </section>
                            ) : null}
                          </div>

                          <section>
                            <div className="mb-2 flex items-center gap-2">
                              <TestTube2 className="size-4 text-[var(--oc-status-info)]" />
                              <h3 className="text-sm font-semibold">Call connector tool</h3>
                            </div>
                            <p className="mb-3 text-xs text-[var(--oc-text-muted)]">
                              Calls are audited. Write, deploy and secret-capable integrations may create a human gate.
                            </p>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[220px_1fr]">
                              <label className="space-y-1 text-xs text-[var(--oc-text-muted)]">
                                Tool
                                <UiSelect
                                  className="w-full"
                                  value={toolSelection[definition.id] ?? ""}
                                  onChange={(event) =>
                                    setToolSelection((current) => ({
                                      ...current,
                                      [definition.id]: event.target.value,
                                    }))
                                  }
                                  disabled={!connected || pendingId === definition.id}
                                  aria-label={`${definition.displayName} tool`}
                                >
                                  {definition.toolAllowlist.map((tool) => (
                                    <option key={tool} value={tool}>
                                      {tool}
                                    </option>
                                  ))}
                                </UiSelect>
                              </label>
                              <label className="space-y-1 text-xs text-[var(--oc-text-muted)]">
                                JSON arguments
                                <UiTextarea
                                  className="w-full font-mono text-xs"
                                  value={argsById[definition.id] ?? "{}"}
                                  onChange={(event) =>
                                    setArgsById((current) => ({
                                      ...current,
                                      [definition.id]: event.target.value,
                                    }))
                                  }
                                  disabled={!connected || pendingId === definition.id}
                                  aria-label={`${definition.displayName} tool arguments`}
                                />
                              </label>
                            </div>
                            <UiButton
                              className="mt-3"
                              onClick={() => void callTool(definition)}
                              disabled={!projectId || !connected || pendingId === definition.id}
                              title={connected ? "Call the selected tool" : "Enable this integration first"}
                            >
                              <TestTube2 />
                              Call tool
                            </UiButton>

                            {actionError[definition.id] ? (
                              <div className="mt-3 flex items-start gap-2 border border-[var(--oc-status-danger)]/45 bg-[var(--oc-status-danger)]/10 p-3 text-xs text-[var(--oc-status-danger)]">
                                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                                {actionError[definition.id]}
                              </div>
                            ) : null}
                            {actionResult[definition.id] ? (
                              actionResult[definition.id].startsWith("{") ? (
                                <UiCodeBlock className="mt-3 max-h-72 whitespace-pre-wrap">
                                  {actionResult[definition.id]}
                                </UiCodeBlock>
                              ) : (
                                <div className="mt-3 border border-[var(--oc-status-success)]/45 bg-[var(--oc-status-success)]/10 p-3 text-xs text-[var(--oc-status-success)]">
                                  {actionResult[definition.id]}
                                </div>
                              )
                            ) : null}
                          </section>
                        </div>
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>

            {visibleDefinitions.length === 0 ? (
              <UiEmptyState title="No integrations in this filter" />
            ) : null}

            <section className="mt-8 border-t border-[var(--oc-border-muted)] pt-5">
              <div className="flex items-center gap-2">
                <PackageOpen className="size-4 text-[var(--oc-status-warning)]" />
                <h2 className="text-sm font-semibold">Installed Skill Packs</h2>
                <span className="text-xs text-[var(--oc-text-muted)]">{skillPacks.length}</span>
              </div>
              <div className="mt-3 divide-y divide-[var(--oc-border-muted)] border-y border-[var(--oc-border-muted)]">
                {skillPacks.map((pack) => (
                  <div
                    key={pack.id}
                    className="grid grid-cols-1 gap-2 py-3 text-sm sm:grid-cols-[220px_1fr]"
                    data-testid={`skill-pack-${pack.id}`}
                  >
                    <div>
                      <div className="font-medium">{pack.title}</div>
                      <div className="font-mono text-xs text-[var(--oc-text-muted)]">{pack.id}</div>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--oc-text-muted)]">{pack.description}</p>
                      <p className="mt-1 text-xs">
                        Replaces: {pack.replacesIntegrationIds.join(", ")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

function IntegrationsPageContent() {
  const searchParams = useSearchParams();
  return <IntegrationsView projectId={searchParams.get("projectId") ?? ""} />;
}

export default function IntegrationsPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[var(--oc-surface-base)] p-6">Loading…</main>}>
      <IntegrationsPageContent />
    </Suspense>
  );
}
