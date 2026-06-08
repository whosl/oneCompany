"use client";

import { useEffect, useState } from "react";
import type { EnvironmentReadiness } from "@oc/shared";
import { consoleApi } from "@/lib/api";

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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
            <section>
              <h3 className="font-medium">Workspace paths</h3>
              <p className="text-[var(--oc-text-muted)]">{readiness.workspaceRoot}</p>
              <p className="text-[var(--oc-text-muted)]">{readiness.generatedProjectsRoot}</p>
            </section>
            <section>
              <h3 className="font-medium">Secrets readiness</h3>
              <p>API key: {readiness.apiKeyReady ? "Ready" : "Missing"}</p>
              <p>Tunnel: {readiness.tunnelConfigured ? "Configured" : "Not configured"}</p>
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
          </div>
        ) : (
          <p>Loading environment readiness…</p>
        )}
      </div>
    </div>
  );
}
