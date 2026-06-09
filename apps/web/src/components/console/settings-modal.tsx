"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { EnvironmentReadiness } from "@oc/shared";
import { consoleApi } from "@/lib/api";

function engineLabel(ready: boolean): string {
  return ready ? "Ready" : "Missing";
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

  useEffect(() => {
    if (!open) {
      return;
    }
    void consoleApi.getEnvironmentReadiness().then(setReadiness);
  }, [open]);

  if (!open) {
    return null;
  }

  const engine = readiness?.engine;
  const workflowMissing = engine ? !engine.workflowLlmReady : !readiness?.apiKeyReady;
  const opencodeCliMissing = engine ? !engine.opencodeCliReady : false;
  const opencodeModelMissing = engine ? !engine.opencodeModelReady : false;
  const showDegradedNotice = workflowMissing || opencodeCliMissing || opencodeModelMissing;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" data-testid="settings-modal">
      <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-lg border bg-[var(--oc-surface-base)] p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button type="button" onClick={onClose} className="text-sm">
            Close
          </button>
        </div>

        {readiness ? (
          <div className="space-y-4 text-sm">
            {showDegradedNotice ? (
              <section
                className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3"
                data-testid="engine-degraded-notice"
              >
                <h3 className="font-medium text-amber-200">Engine degraded (§12)</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--oc-text-muted)]">
                  {workflowMissing ? (
                    <li>
                      Workflow agents need <code>OC_LLM_API_KEY</code> or <code>OPENAI_API_KEY</code> in the API
                      server <code>.env</code>. Until configured, requirement and planning steps use mock data and
                      will prompt you — they will not silently pass.
                    </li>
                  ) : null}
                  {opencodeCliMissing ? (
                    <li>
                      Slice development needs the <code>opencode</code> CLI on PATH, or set{" "}
                      <code>OC_USE_STUB_ENGINE=1</code> for local stub mode only.
                    </li>
                  ) : null}
                  {opencodeModelMissing ? (
                    <li>
                      Opencode model auth is missing. Configure <code>~/.local/share/opencode/auth.json</code> (or your
                      provider credentials) so governed slices can run.
                    </li>
                  ) : null}
                </ul>
              </section>
            ) : null}

            <section>
              <h3 className="font-medium">Workspace paths</h3>
              <p className="text-[var(--oc-text-muted)]">{readiness.workspaceRoot}</p>
              <p className="text-[var(--oc-text-muted)]">{readiness.generatedProjectsRoot}</p>
            </section>

            <section>
              <h3 className="font-medium">Engine readiness</h3>
              {engine ? (
                <ul>
                  <li>Workflow LLM: {engineLabel(engine.workflowLlmReady)}</li>
                  <li>Opencode CLI: {engineLabel(engine.opencodeCliReady)}</li>
                  <li>Opencode model: {engineLabel(engine.opencodeModelReady)}</li>
                </ul>
              ) : (
                <p className="text-[var(--oc-text-muted)]">API key: {readiness.apiKeyReady ? "Ready" : "Missing"}</p>
              )}
              <p className="mt-1 text-[var(--oc-text-muted)]">
                Tunnel: {readiness.tunnelConfigured ? "Configured" : "Not configured"}
              </p>
            </section>

            <section>
              <h3 className="font-medium">Environment checks</h3>
              <ul>
                {Object.entries(readiness.checks).map(([name, ok]) => (
                  <li key={name}>
                    {name}: {ok ? "ok" : "missing"}
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="font-medium">Policy chips</h3>
              <ul>
                {readiness.policies.map((policy) => (
                  <li key={policy}>{policy}</li>
                ))}
              </ul>
            </section>

            <section data-testid="settings-integrations-link">
              <h3 className="font-medium">Integrations</h3>
              <p className="text-[var(--oc-text-muted)]">
                View connector readiness, offline fallback packs, and secret readiness (names only).
              </p>
              <Link
                href={projectId ? `/integrations?projectId=${projectId}` : "/integrations"}
                className="mt-2 inline-block text-sm underline"
                onClick={onClose}
              >
                Open Integrations
              </Link>
            </section>
          </div>
        ) : (
          <p>Loading environment readiness…</p>
        )}
      </div>
    </div>
  );
}
