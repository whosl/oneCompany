import type { StreamItem } from "../ui-v2/types";
import type { AgentRun } from "./types";

const SEVERITY_BORDER: Record<NonNullable<StreamItem["severity"]>, string> = {
  neutral: "border-[var(--v3-border)]",
  success: "border-[var(--v3-success)]/35",
  warning: "border-[var(--v3-warning)]/45",
  danger: "border-[var(--v3-danger)]/45",
};

function TimelineEvent({
  item,
  run,
  highlighted,
}: {
  item: StreamItem;
  run?: AgentRun;
  highlighted?: boolean;
}) {
  const border = SEVERITY_BORDER[item.severity ?? "neutral"];
  return (
    <article
      className={[
        "rounded-md border bg-[var(--v3-surface)] px-3 py-2.5",
        border,
        highlighted ? "ring-2 ring-[var(--v3-accent)]/25" : "",
      ].join(" ")}
      data-seq={item.seq}
      data-type={item.type}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 font-mono text-[10px] text-[var(--v3-text-muted)]">
            #{item.seq}
          </span>
          <span className="truncate text-sm font-medium">{item.title}</span>
        </div>
        <time className="shrink-0 text-[10px] text-[var(--v3-text-muted)]">{item.timestamp}</time>
      </div>
      <p className="mt-1 line-clamp-3 text-xs text-[var(--v3-text-muted)]">{item.summary}</p>
      {run ? (
        <p className="mt-1 text-[10px] text-[var(--v3-accent)]">
          {run.agentName} · {run.status}
        </p>
      ) : null}
    </article>
  );
}

export function Timeline({
  items,
  runs,
  selectedAgentId,
  statusMarkers = [],
}: {
  items: StreamItem[];
  runs: AgentRun[];
  selectedAgentId?: string;
  statusMarkers?: Array<{ seq: number; status: string }>;
}) {
  const runById = new Map(runs.map((run) => [run.id, run]));
  const agentRunIds = selectedAgentId
    ? new Set(
        runs
          .filter((run) => run.agentId.split("@")[0] === selectedAgentId)
          .map((run) => run.id),
      )
    : undefined;

  const statusAtSeq = new Map(statusMarkers.map((marker) => [marker.seq, marker.status]));

  return (
    <section className="space-y-2" data-testid="ui-v3-timeline">
      {items.map((item) => {
        const status = statusAtSeq.get(item.seq);
        const run = item.runId ? runById.get(item.runId) : undefined;
        const highlighted = agentRunIds ? Boolean(item.runId && agentRunIds.has(item.runId)) : false;
        return (
          <div key={item.id}>
            {status ? (
              <div className="my-3 flex items-center gap-2">
                <div className="h-px flex-1 bg-[var(--v3-border-strong)]" />
                <span className="rounded-full border border-[var(--v3-border)] bg-[var(--v3-surface-muted)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--v3-text-muted)]">
                  {status}
                </span>
                <div className="h-px flex-1 bg-[var(--v3-border-strong)]" />
              </div>
            ) : null}
            <TimelineEvent item={item} run={run} highlighted={highlighted} />
          </div>
        );
      })}
    </section>
  );
}
