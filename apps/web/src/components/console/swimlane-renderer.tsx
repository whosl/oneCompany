"use client";

import type { ConsoleProjection } from "@/lib/projection/types";

const PHASES = ["plan", "act", "observe", "reflect", "user", "gate"] as const;

export function SwimlaneRenderer({ projection }: { projection: ConsoleProjection }) {
  const agents = Array.from(new Set(projection.swimlane.map((cell) => cell.agentId)));

  return (
    <div className="overflow-auto p-3" data-testid="swimlane-renderer">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="border border-[var(--oc-border-muted)] p-2 text-left">Agent</th>
            {PHASES.map((phase) => (
              <th key={phase} className="border border-[var(--oc-border-muted)] p-2 text-left">
                {phase}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {agents.map((agentId) => (
            <tr key={agentId}>
              <td className="border border-[var(--oc-border-muted)] p-2 font-mono">{agentId}</td>
              {PHASES.map((phase) => {
                const cell = projection.swimlane.find(
                  (entry) => entry.agentId === agentId && entry.phase === phase,
                );
                const statusClass =
                  cell?.status === "failed"
                    ? "text-[var(--oc-status-danger)]"
                    : cell?.status === "active"
                      ? "text-[var(--oc-accent-primary)]"
                      : "text-[var(--oc-text-muted)]";
                return (
                  <td
                    key={`${agentId}-${phase}`}
                    className={`border border-[var(--oc-border-muted)] p-2 ${statusClass}`}
                  >
                    {cell?.summary ?? "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
