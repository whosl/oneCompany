"use client";

import { useEffect, useState } from "react";
import type { ConsoleProjection } from "@/lib/projection/types";
import { consoleApi } from "@/lib/api";

function splitAnswers(text: string, questionCount: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }
  if (questionCount <= 1) {
    return [trimmed];
  }
  const lines = trimmed
    .split(/\n+/)
    .map((line) => line.replace(/^\d+[\).\]]\s*/, "").trim())
    .filter(Boolean);
  if (lines.length >= questionCount) {
    return lines.slice(0, questionCount);
  }
  return [trimmed];
}

export function Composer({
  projectId,
  projection,
  questionAnswers = [],
  onPendingChange,
  onSubmitted,
}: {
  projectId: string;
  projection: ConsoleProjection;
  questionAnswers?: string[];
  onPendingChange?: (pending: boolean) => void;
  onSubmitted?: () => void;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);

  const status = projection.snapshot.project.status;
  const pendingQuestions = projection.snapshot.requirement?.pendingQuestions ?? [];
  const blockingGate = projection.openGates.find(
    (gate) => gate.id === projection.blockingGateId,
  );
  const gateOptions = blockingGate?.options ?? [];
  const awaitingAnswers = status === "Asking Questions" && pendingQuestions.length > 0;
  const allQuestionAnswersReady =
    pendingQuestions.length > 0 &&
    questionAnswers.length === pendingQuestions.length &&
    questionAnswers.every((answer) => answer.trim().length > 0);

  async function submitRequirement() {
    setPending(true);
    setError(null);
    try {
      if (status === "Asking Questions" || status === "Draft Requirement") {
        if (projection.snapshot.requirement?.rawRequirement) {
          const answers =
            pendingQuestions.length > 0 && questionAnswers.some((answer) => answer.trim())
              ? questionAnswers.map((answer) => answer.trim())
              : splitAnswers(text, pendingQuestions.length || 1);
          await consoleApi.submitRequirementAnswers(projectId, answers);
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

  async function startDevelopment() {
    setPending(true);
    setError(null);
    try {
      await consoleApi.startDevelopment(projectId);
      onSubmitted?.();
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Start development failed");
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
      {awaitingAnswers ? (
        <p className="mb-2 text-xs text-[var(--oc-text-muted)]" data-testid="composer-questions-hint">
          Select A/B/C or fill in D for each question card above, then submit.
        </p>
      ) : null}

      {status === "PRD Ready" && !blockingGate ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="text-sm text-[var(--oc-text-muted)]">PRD is ready — start the development phase.</p>
          <button
            type="button"
            disabled={pending}
            className="rounded-md bg-[var(--oc-accent-primary)] px-3 py-1.5 text-xs text-white"
            onClick={() => void startDevelopment()}
            data-testid="composer-start-development"
          >
            Start development
          </button>
        </div>
      ) : null}

      {blockingGate ? (
        <div className="mb-2 text-xs text-[var(--oc-text-muted)]">
          Gate blocked: choose an allowed decision. Custom text does not imply approval.
        </div>
      ) : null}

      {!awaitingAnswers ? (
        <textarea
          className="min-h-16 w-full rounded-md border border-[var(--oc-border-muted)] px-3 py-2 text-sm"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={
            blockingGate
              ? "Attach custom text to an allowed gate decision"
              : status === "PRD Ready"
                ? "Optional: add notes or a revised requirement"
                : "Describe your product requirement"
          }
          aria-label="Composer input"
        />
      ) : null}
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
        {!blockingGate && status !== "PRD Ready" ? (
          <button
            type="button"
            disabled={
              pending || (awaitingAnswers ? !allQuestionAnswersReady : text.trim().length === 0)
            }
            className="rounded-md bg-[var(--oc-accent-primary)] px-3 py-1 text-xs text-white"
            onClick={() => void submitRequirement()}
          >
            {awaitingAnswers ? "Submit answers" : "Send"}
          </button>
        ) : null}
        {!blockingGate && status === "PRD Ready" && text.trim().length > 0 ? (
          <button
            type="button"
            disabled={pending}
            className="rounded-md border px-3 py-1 text-xs"
            onClick={() => void submitRequirement()}
          >
            Send note
          </button>
        ) : null}
      </div>
    </div>
  );
}
