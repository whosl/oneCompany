import type { SwimlaneRow } from "../ui-v2/types";

const CELL_STATUS: Record<string, string> = {
  completed: "bg-[var(--v3-success)]/12 text-[var(--v3-success)]",
  active: "bg-[var(--v3-accent-soft)] text-[var(--v3-accent)] ring-1 ring-[var(--v3-accent)]/30",
  failed: "bg-[var(--v3-danger)]/12 text-[var(--v3-danger)]",
};

export function SwimlaneMatrix({ rows }: { rows: SwimlaneRow[] }) {
  const steps = ["Plan", "Act", "Observe", "Reflect"] as const;

  return (
    <div className="overflow-auto" data-testid="ui-v3-swimlane">
      <table className="w-full min-w-[640px] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-[var(--v3-border)]">
            <th className="px-2 py-2 font-semibold text-[var(--v3-text-muted)]">Agent</th>
            {steps.map((step) => (
              <th key={step} className="px-2 py-2 font-semibold text-[var(--v3-text-muted)]">
                {step}
              </th>
            ))}
            <th className="px-2 py-2 font-semibold text-[var(--v3-text-muted)]">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-[var(--v3-border)]/70">
              <td className="px-2 py-2 font-medium">{row.agentName}</td>
              {steps.map((step) => {
                const cell = row.cells.find((candidate) => candidate.step === step);
                return (
                  <td key={step} className="px-2 py-2 align-top">
                    {cell ? (
                      <div
                        className={[
                          "rounded-md px-2 py-1.5",
                          CELL_STATUS[cell.status] ?? "bg-[var(--v3-surface-muted)]",
                        ].join(" ")}
                      >
                        <div className="line-clamp-2">{cell.summary}</div>
                      </div>
                    ) : (
                      <span className="text-[var(--v3-text-muted)]">—</span>
                    )}
                  </td>
                );
              })}
              <td className="px-2 py-2">
                <span className="rounded-full bg-[var(--v3-surface-muted)] px-2 py-0.5 text-[10px] font-medium uppercase">
                  {row.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
