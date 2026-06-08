"use client";

import { useState } from "react";
import type { ConsoleProjection } from "@/lib/projection/types";
import { consoleApi } from "@/lib/api";

export function Composer({
  projectId,
  projection,
  onSubmitted,
}: {
  projectId: string;
  projection: ConsoleProjection;
  onSubmitted?: () => void;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blockingGate = projection.openGates.find(
    (gate) => gate.id === projection.blockingGateId,
  );
  const gateOptions = blockingGate?.options ?? [];

  async function submitRequirement() {
    setPending(true);
    setError(null);
    try {
      if (
        projection.snapshot.project.status === "Asking Questions" ||
        projection.snapshot.project.status === "Draft Requirement"
      ) {
        if (projection.snapshot.requirement?.rawRequirement) {
          await consoleApi.submitRequirementAnswers(projectId, [text]);
        } else {
          await consoleApi.startRequirement(projectId, text);
        }
      } else {
        await consoleApi.startRequirement(projectId, text);
      }
      setText("");
      onSubmitted?.();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Submit failed");
    } finally {
      setPending(false);
    }
  }

  async function resolveGate(decision: string) {
    if (!blockingGate) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await consoleApi.resolveGate(
        blockingGate.id,
        decision,
        decision === "custom" ? text : undefined,
      );
      setText("");
      onSubmitted?.();
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : "Resolve failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="border-t border-[var(--oc-border-muted)] bg-[var(--oc-surface-base)] p-3" data-testid="composer">
      {blockingGate ? (
        <div className="mb-2 text-xs text-[var(--oc-text-muted)]">
          Gate blocked: choose an allowed decision. Custom text does not imply approval.
        </div>
      ) : null}
      <textarea
        className="min-h-16 w-full rounded-md border border-[var(--oc-border-muted)] px-3 py-2 text-sm"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={
          blockingGate
            ? "Attach custom text to an allowed gate decision"
            : "Answer questions, add requirements, or send notes"
        }
        aria-label="Composer input"
      />
      {error ? <p className="mt-2 text-xs text-[var(--oc-status-danger)]">{error}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {blockingGate
          ? gateOptions
              .filter((option) => option !== "custom")
              .map((option) => (
                <button
                  key={option}
                  type="button"
                  disabled={pending}
                  className="rounded-md border px-3 py-1 text-xs"
                  onClick={() => void resolveGate(option)}
                >
                  {option.replaceAll("_", " ")}
                </button>
              ))
          : null}
        {blockingGate && gateOptions.includes("custom") ? (
          <button
            type="button"
            disabled={pending || text.trim().length === 0}
            className="rounded-md border px-3 py-1 text-xs"
            onClick={() => void resolveGate("custom")}
          >
            submit custom
          </button>
        ) : null}
        {!blockingGate ? (
          <button
            type="button"
            disabled={pending || text.trim().length === 0}
            className="rounded-md bg-[var(--oc-accent-primary)] px-3 py-1 text-xs text-white"
            onClick={() => void submitRequirement()}
          >
            Send
          </button>
        ) : null}
      </div>
    </div>
  );
}
