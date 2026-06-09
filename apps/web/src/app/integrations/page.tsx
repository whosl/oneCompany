"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { IntegrationStatusSnapshot, SkillPack } from "@oc/shared";
import { integrationsApi } from "@/lib/api";

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

function statusClass(status: IntegrationStatusSnapshot["status"]): string {
  switch (status) {
    case "connected":
      return "bg-emerald-500/15 text-emerald-200";
    case "offline_fallback":
      return "bg-amber-500/15 text-amber-200";
    case "expired":
      return "bg-rose-500/15 text-rose-200";
    default:
      return "bg-[var(--oc-surface-raised)] text-[var(--oc-text-muted)]";
  }
}

export default function IntegrationsPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") ?? "";
  const [integrations, setIntegrations] = useState<IntegrationStatusSnapshot[]>([]);
  const [skillPacks, setSkillPacks] = useState<SkillPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const packs = await integrationsApi.listSkillPacks();
        if (cancelled) {
          return;
        }
        setSkillPacks(packs.skillPacks);
        if (projectId) {
          const status = await integrationsApi.listProjectStatus(projectId);
          if (cancelled) {
            return;
          }
          setIntegrations(status.integrations);
        } else {
          const definitions = await integrationsApi.listDefinitions();
          if (cancelled) {
            return;
          }
          setIntegrations(
            definitions.integrations.map((definition) => ({
              integrationId: definition.id,
              displayName: definition.displayName,
              version: definition.version,
              status: "not_configured",
              secretReadiness: definition.secretRefs.map((ref) => ({
                ref,
                configured: false,
              })),
              offlineFallbackSkillPackId: definition.offlineFallbackSkillPackId,
              scopes: [],
            })),
          );
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load integrations");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return (
    <main className="mx-auto min-h-screen max-w-4xl p-6" data-testid="integrations-page">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Integrations</h1>
          <p className="mt-1 text-sm text-[var(--oc-text-muted)]">
            Connector readiness, project bindings, and offline Skill Pack fallbacks. Secrets are never
            shown — only readiness.
          </p>
        </div>
        <Link href={projectId ? `/projects/${projectId}` : "/"} className="text-sm underline">
          Back to console
        </Link>
      </div>

      {projectId ? (
        <p className="mb-4 text-sm text-[var(--oc-text-muted)]" data-testid="integrations-project-scope">
          Project scope: <code>{projectId}</code>
        </p>
      ) : (
        <p className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          Open from a project console Settings link to see per-project connection status and scopes.
        </p>
      )}

      {loading ? <p>Loading integrations…</p> : null}
      {error ? <p className="text-rose-300">{error}</p> : null}

      {!loading && !error ? (
        <div className="space-y-4">
          {integrations.map((integration) => (
            <section
              key={integration.integrationId}
              className="rounded-lg border border-[var(--oc-border-muted)] bg-[var(--oc-surface-base)] p-4"
              data-testid={`integration-card-${integration.integrationId}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-medium">{integration.displayName}</h2>
                <span
                  className={`rounded-full px-2 py-1 text-xs ${statusClass(integration.status)}`}
                  data-testid={`integration-status-${integration.integrationId}`}
                >
                  {statusLabel(integration.status)}
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--oc-text-muted)]">
                {integration.integrationId} · v{integration.version}
              </p>
              {integration.scopes.length > 0 ? (
                <p className="mt-2 text-sm">
                  Scopes: {integration.scopes.join(", ")}
                </p>
              ) : null}
              {integration.offlineFallbackSkillPackId ? (
                <p className="mt-2 text-sm text-[var(--oc-text-muted)]">
                  Offline pack: {integration.offlineFallbackSkillPackId}
                </p>
              ) : null}
              {integration.secretReadiness.length > 0 ? (
                <ul className="mt-3 space-y-1 text-sm">
                  {integration.secretReadiness.map((secret) => (
                    <li key={secret.ref} data-testid={`secret-readiness-${secret.ref}`}>
                      {secret.ref}: {secret.configured ? "configured" : "missing"}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-[var(--oc-text-muted)]">No secrets required.</p>
              )}
            </section>
          ))}

          <section className="rounded-lg border border-[var(--oc-border-muted)] p-4">
            <h2 className="text-lg font-medium">Installed Skill Packs</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {skillPacks.map((pack) => (
                <li key={pack.id} data-testid={`skill-pack-${pack.id}`}>
                  <span className="font-medium">{pack.title}</span>
                  <span className="text-[var(--oc-text-muted)]"> — replaces {pack.replacesIntegrationIds.join(", ")}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}
    </main>
  );
}
