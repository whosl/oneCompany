"use client";

import { useCallback, useEffect, useState } from "react";
import { GateCard } from "../../../components/gate-card";
import { fetchOpenGates, resolveGate, type GateRecord } from "../../../lib/gates";
import { getGatePresentation } from "../../../lib/gate-presentations";

export default function DevGatesPage() {
  const [projectId, setProjectId] = useState("");
  const [gates, setGates] = useState<GateRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadGates = useCallback(async (id: string) => {
    if (!id.trim()) {
      setGates([]);
      return;
    }
    setError(null);
    try {
      const openGates = await fetchOpenGates(id.trim());
      setGates(openGates);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load gates");
      setGates([]);
    }
  }, []);

  useEffect(() => {
    void loadGates(projectId);
  }, [loadGates, projectId]);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Dev Human Gates</h1>
      <p className="text-sm text-muted-foreground">
        Temporary M4 viewer. Paste a project id to resolve open human gates.
      </p>
      <label className="flex flex-col gap-2 text-sm">
        Project ID
        <input
          className="rounded-md border px-3 py-2"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          placeholder="project uuid"
        />
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex flex-col gap-4">
        {gates.map((gate) => {
          const presentation = getGatePresentation(gate.gateType);
          return (
            <GateCard
              key={gate.id}
              gateId={gate.id}
              gateType={gate.gateType}
              title={presentation.title}
              description={presentation.description}
              options={gate.options}
              status={gate.status}
              decision={gate.decision}
              onResolve={async (input) => {
                await resolveGate({
                  gateId: gate.id,
                  decision: input.decision,
                  customText: input.customText,
                });
                await loadGates(projectId);
              }}
            />
          );
        })}
      </div>
    </main>
  );
}
