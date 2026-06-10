import { RUN_STATUS_LABEL } from "./constants";
import type { UiV3AgentState } from "./types";

const STATUS_DOT: Record<UiV3AgentState["status"], string> = {
  pending: "bg-[var(--v3-border-strong)]",
  running: "bg-[var(--v3-accent)] animate-pulse",
  waiting: "bg-[var(--v3-info)]",
  gated: "bg-[var(--v3-warning)]",
  failed: "bg-[var(--v3-danger)]",
  interrupted: "bg-[var(--v3-warning)]",
  completed: "bg-[var(--v3-success)]",
};

function AgentRow({ agent, selected, onSelect }: {
  agent: UiV3AgentState;
  selected: boolean;
  onSelect?: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(agent.id)}
      className={[
        "w-full rounded-md border px-2.5 py-2 text-left transition-colors",
        selected
          ? "border-[var(--v3-accent)] bg-[var(--v3-accent-soft)]"
          : "border-transparent hover:border-[var(--v3-border)] hover:bg-[var(--v3-surface-subtle)]",
      ].join(" ")}
      data-agent-id={agent.id}
    >
      <div className="flex items-center gap-2">
        <span className={`size-2 shrink-0 rounded-full ${STATUS_DOT[agent.status]}`} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{agent.name}</span>
        {agent.runCount > 0 ? (
          <span className="text-[10px] text-[var(--v3-text-muted)]">×{agent.runCount}</span>
        ) : null}
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2 pl-4">
        <span className="truncate text-[11px] text-[var(--v3-text-muted)]">{agent.role}</span>
        <span className="shrink-0 text-[10px] font-medium text-[var(--v3-text-muted)]">
          {RUN_STATUS_LABEL[agent.status]}
        </span>
      </div>
    </button>
  );
}

export function AgentRoster({
  agents,
  selectedAgentId,
  onSelectAgent,
}: {
  agents: UiV3AgentState[];
  selectedAgentId?: string;
  onSelectAgent?: (id: string) => void;
}) {
  const requirement = agents.filter((agent) => agent.group === "requirement");
  const development = agents.filter((agent) => agent.group === "development");

  return (
    <aside
      className="flex h-full min-h-0 flex-col border-r border-[var(--v3-border)] bg-[var(--v3-surface)]"
      data-testid="ui-v3-agent-roster"
    >
      <div className="border-b border-[var(--v3-border)] px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--v3-text-muted)]">
          Agent 状态
        </h2>
        <p className="mt-0.5 text-[11px] text-[var(--v3-text-muted)]">12 个子 agent · 实时 run 状态</p>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-2">
        <section>
          <h3 className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--v3-req)]">
            Requirement
          </h3>
          <div className="space-y-0.5">
            {requirement.map((agent) => (
              <AgentRow
                key={agent.id}
                agent={agent}
                selected={selectedAgentId === agent.id}
                onSelect={onSelectAgent}
              />
            ))}
          </div>
        </section>
        <section>
          <h3 className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--v3-dev)]">
            Development
          </h3>
          <div className="space-y-0.5">
            {development.map((agent) => (
              <AgentRow
                key={agent.id}
                agent={agent}
                selected={selectedAgentId === agent.id}
                onSelect={onSelectAgent}
              />
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}
