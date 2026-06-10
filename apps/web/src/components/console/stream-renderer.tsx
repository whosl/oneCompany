"use client";

import { GateCard } from "../gate-card";
import type { ConsoleProjection } from "@/lib/projection/types";
import { consoleApi } from "@/lib/api";
import { usePinToBottom } from "@/lib/use-pin-to-bottom";
import { RequirementQuestionCard } from "./requirement-question-card";
import { StreamRunGroup } from "./stream-run-group";
import { StreamToolCallRow } from "./stream-tool-call-row";

type NavigableRightTab = "files" | "tests" | "terminal" | "report";

function renderStreamItem(
  item: ConsoleProjection["streamItems"][number],
  options: {
    questionAnswers?: string[];
    onQuestionAnswerChange?: (index: number, answer: string) => void;
    onNavigateTab?: (tab: NavigableRightTab) => void;
  },
) {
  const isUser = item.origin === "user";
  const isQuestion = item.kind === "requirement.question";
  const questionIndex =
    typeof item.metadata?.questionIndex === "number" ? item.metadata.questionIndex : -1;
  const suggestedAnswers = Array.isArray(item.metadata?.suggestedAnswers)
    ? (item.metadata.suggestedAnswers as string[])
    : [];

  if (isQuestion && questionIndex >= 0) {
    return (
      <RequirementQuestionCard
        key={item.id}
        index={questionIndex}
        question={item.summary}
        suggestedAnswers={suggestedAnswers}
        value={options.questionAnswers?.[questionIndex] ?? ""}
        onChange={(answer) => options.onQuestionAnswerChange?.(questionIndex, answer)}
      />
    );
  }

  if (item.kind.startsWith("tool_call.")) {
    return (
      <StreamToolCallRow
        key={item.id}
        title={String(item.metadata?.toolName ?? item.title)}
        summary={item.summary}
        status={
          item.kind === "tool_call.started"
            ? "started"
            : item.metadata?.toolName === "failed"
              ? "failed"
              : "output"
        }
        artifactPath={
          typeof item.metadata?.artifactPath === "string" ? item.metadata.artifactPath : undefined
        }
        onOpenTerminal={() => options.onNavigateTab?.("terminal")}
      />
    );
  }

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
          onClick={() => options.onNavigateTab?.(item.metadata?.navigateTab as NavigableRightTab)}
        >
          Open in {String(item.metadata.navigateTab)} tab
        </button>
      ) : null}
      {item.metadata?.large ? (
        <button
          type="button"
          className="mt-2 text-xs text-[var(--oc-accent-primary)] underline"
          onClick={() => options.onNavigateTab?.("terminal")}
        >
          Open in Terminal
        </button>
      ) : null}
    </article>
  );
}

export function StreamRenderer({
  projection,
  questionAnswers,
  onQuestionAnswerChange,
  onNavigateTab,
  onGateResolved,
}: {
  projection: ConsoleProjection;
  questionAnswers?: string[];
  onQuestionAnswerChange?: (index: number, answer: string) => void;
  onNavigateTab?: (tab: NavigableRightTab) => void;
  onGateResolved?: () => void;
}) {
  const blockingGate = projection.openGates.find((gate) => gate.id === projection.blockingGateId);
  const streamScrollKey = `${projection.lastSeq}:${projection.streamItems.length}:${blockingGate?.id ?? "none"}`;
  const { containerRef, pinned, handleScroll, scrollToBottom } = usePinToBottom(streamScrollKey);
  const renderOptions = { questionAnswers, onQuestionAnswerChange, onNavigateTab };

  return (
    <div className="relative flex h-full flex-col" data-testid="stream-renderer">
      {!pinned ? (
        <button
          type="button"
          className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-[var(--oc-border-muted)] bg-[var(--oc-surface-raised)] px-3 py-1 text-xs shadow-sm"
          onClick={() => scrollToBottom("smooth")}
          data-testid="stream-jump-to-latest"
        >
          Jump to latest
        </button>
      ) : null}
      <div
        ref={containerRef}
        className="flex-1 space-y-3 overflow-auto p-3"
        data-testid="stream-scroll-container"
        onScroll={handleScroll}
      >
        {(
          projection.ungroupedStreamItems ??
          projection.streamItems.filter((item) => item.origin !== "gate")
        )
          .filter((item) => item.origin !== "gate")
          .map((item) => renderStreamItem(item, renderOptions))}

        {(projection.streamGroups ?? []).map((group) => (
          <StreamRunGroup key={group.id} group={group} onNavigateTab={onNavigateTab} />
        ))}

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
