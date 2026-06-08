"use client";

import { GateCard } from "../gate-card";
import type { ConsoleProjection } from "@/lib/projection/types";
import { consoleApi } from "@/lib/api";

export function StreamRenderer({
  projection,
  onNavigateTab,
  onGateResolved,
}: {
  projection: ConsoleProjection;
  onNavigateTab?: (tab: "files" | "tests" | "terminal") => void;
  onGateResolved?: () => void;
}) {
  const blockingGate = projection.openGates.find(
    (gate) => gate.id === projection.blockingGateId,
  );

  return (
    <div className="flex h-full flex-col" data-testid="stream-renderer">
      <div className="flex-1 space-y-3 overflow-auto p-3">
        {projection.streamItems.map((item) => {
          const isUser = item.origin === "user";
          return (
            <article
              key={item.id}
              className={
                isUser
                  ? "rounded-md border border-[var(--oc-accent-soft)] bg-[var(--oc-surface-warm)] p-3"
                  : "rounded-md border border-[var(--oc-border-muted)] bg-[var(--oc-surface-raised)] p-3"
              }
              data-testid={`stream-item-${item.kind}`}
            >
              <header className="text-xs font-semibold uppercase tracking-wide text-[var(--oc-text-muted)]">
                {item.title}
              </header>
              <p className="mt-1 text-sm whitespace-pre-wrap">{item.summary}</p>
              {item.metadata?.navigateTab ? (
                <button
                  type="button"
                  className="mt-2 text-xs text-[var(--oc-accent-primary)] underline"
                  onClick={() => onNavigateTab?.(item.metadata?.navigateTab as "files" | "tests")}
                >
                  Open in {String(item.metadata.navigateTab)} tab
                </button>
              ) : null}
              {item.metadata?.large ? (
                <button
                  type="button"
                  className="mt-2 text-xs text-[var(--oc-accent-primary)] underline"
                  onClick={() => onNavigateTab?.("terminal")}
                >
                  Open in Terminal
                </button>
              ) : null}
            </article>
          );
        })}

        {blockingGate ? (
          <GateCard
            gateId={blockingGate.id}
            gateType={blockingGate.gateType}
            title="Blocking gate"
            description="Resolve this gate to continue the workflow."
            options={blockingGate.options}
            status="open"
            onResolve={async ({ decision, customText }) => {
              await consoleApi.resolveGate(blockingGate.id, decision, customText);
              onGateResolved?.();
            }}
          />
        ) : null}

        {projection.streamItems
          .filter((item) => item.kind === "human_gate.resolved")
          .map((item) => (
            <div
              key={item.id}
              className="rounded-md border px-3 py-2 text-xs text-[var(--oc-text-muted)]"
            >
              Resolved: {item.summary}
            </div>
          ))}
      </div>
    </div>
  );
}
