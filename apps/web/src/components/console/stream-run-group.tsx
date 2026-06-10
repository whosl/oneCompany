"use client";

import { useState } from "react";
import type { StreamRunGroup } from "@/lib/projection/types";
import { StreamToolCallRow } from "./stream-tool-call-row";

type NavigableRightTab = "files" | "tests" | "terminal" | "report";

export function StreamRunGroup({
  group,
  onNavigateTab,
}: {
  group: StreamRunGroup;
  onNavigateTab?: (tab: NavigableRightTab) => void;
}) {
  const [collapsed, setCollapsed] = useState(group.collapsed);

  return (
    <section
      className="rounded-md border border-[var(--oc-border-muted)] bg-[var(--oc-surface)]"
      data-testid="stream-run-group"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between border-b border-[var(--oc-border-muted)] px-3 py-2 text-left text-sm font-medium"
        onClick={() => setCollapsed((open) => !open)}
      >
        <span>
          Run {group.runId.slice(0, 8)}
          {group.agentId ? ` · ${group.agentId}` : ""}
        </span>
        <span>{collapsed ? "Expand" : "Collapse"}</span>
      </button>

      {!collapsed ? (
        <div className="space-y-3 p-3">
          {group.segments.map((segment) => (
            <details key={segment.id} open={segment.expanded}>
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-[var(--oc-text-muted)]">
                {segment.phase}
              </summary>
              <p className="mt-1 text-sm whitespace-pre-wrap">{segment.summary}</p>
            </details>
          ))}

          {group.items
            .filter((item) => item.kind.startsWith("tool_call."))
            .map((item) => (
              <StreamToolCallRow
                key={item.id}
                title={String(item.metadata?.toolName ?? item.title)}
                summary={item.summary}
                status={
                  item.kind === "tool_call.started"
                    ? "started"
                    : item.kind === "tool_call.result" && item.metadata?.toolName === "failed"
                      ? "failed"
                      : "output"
                }
                artifactPath={
                  typeof item.metadata?.artifactPath === "string"
                    ? item.metadata.artifactPath
                    : undefined
                }
                onOpenTerminal={() => onNavigateTab?.("terminal")}
              />
            ))}
        </div>
      ) : null}
    </section>
  );
}
