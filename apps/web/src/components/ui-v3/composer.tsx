"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { RequirementQuestionCard } from "../console/requirement-question-card";
import { UiButton } from "../ui-v2/primitives";
import type { UiV3PendingQuestion } from "./types";
import type { ComposerProjection } from "@/lib/projection/types";

export function ComposerPanel({
  composer,
  pendingQuestions,
  disabled,
  onSubmit,
  onSkipClarification,
}: {
  composer: ComposerProjection;
  pendingQuestions: UiV3PendingQuestion[];
  disabled?: boolean;
  onSubmit?: (mode: ComposerProjection["mode"], text: string, answers?: string[]) => Promise<void>;
  onSkipClarification?: () => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [answers, setAnswers] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  const gated = composer.mode === "gate_decision";
  const canSubmit =
    !composer.disabled &&
    !composer.readOnly &&
    !gated &&
    !disabled &&
    (composer.mode === "question_round"
      ? answers.some((answer) => answer.trim().length > 0)
      : text.trim().length > 0);
  const canSkip =
    composer.mode === "question_round" &&
    !composer.disabled &&
    !composer.readOnly &&
    !disabled &&
    Boolean(onSkipClarification);

  async function submit() {
    if (!canSubmit || !onSubmit) return;
    setPending(true);
    try {
      if (composer.mode === "question_round") {
        await onSubmit(composer.mode, "", answers);
        setAnswers([]);
      } else {
        await onSubmit(composer.mode, text.trim());
        setText("");
      }
    } finally {
      setPending(false);
    }
  }

  async function skip() {
    if (!canSkip || !onSkipClarification) return;
    setPending(true);
    try {
      await onSkipClarification();
      setAnswers([]);
    } finally {
      setPending(false);
    }
  }

  return (
    <footer
      className="border-t border-[var(--v3-border)] bg-[var(--v3-surface)] p-4"
      data-testid="ui-v3-composer"
    >
      <p className="mb-2 text-xs text-[var(--v3-text-muted)]">{composer.reason}</p>

      {composer.mode === "question_round" && pendingQuestions.length > 0 ? (
        <div className="mb-3 max-h-64 space-y-3 overflow-auto">
          {pendingQuestions.map((item) => (
            <RequirementQuestionCard
              key={item.index}
              index={item.index}
              question={item.question}
              suggestedAnswers={item.suggestedAnswers}
              value={answers[item.index] ?? ""}
              onChange={(answer) => {
                setAnswers((current) => {
                  const next = [...current];
                  next[item.index] = answer;
                  return next;
                });
              }}
            />
          ))}
        </div>
      ) : null}

      {gated ? (
        <p className="rounded-md border border-[var(--v3-warning)]/40 bg-[var(--v3-warning)]/8 px-3 py-2 text-sm text-[var(--v3-text)]">
          请在上方「待你确认」区域选择 gate 决策。Composer 在 gate 阻塞时不接受自由文本。
        </p>
      ) : null}

      {!composer.readOnly && !gated ? (
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-md border border-[var(--v3-border)] bg-[var(--v3-surface-subtle)] px-3 py-2 text-sm outline-none focus:border-[var(--v3-accent)]"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={
              composer.mode === "deployment_url"
                ? "粘贴公网部署 URL（https://…）"
                : composer.mode === "change_request"
                  ? "描述你想变更的需求"
                  : composer.mode === "question_round"
                    ? "或在上方选择/填写每题答案后提交整轮"
                    : "用一句话描述你想要的产品"
            }
            disabled={composer.disabled || pending || disabled || composer.mode === "question_round"}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          <UiButton
            variant="primary"
            disabled={!canSubmit || !onSubmit || pending}
            onClick={() => void submit()}
          >
            <Send className="size-4" />
            {composer.mode === "change_request"
              ? "提交变更"
              : composer.mode === "question_round"
                ? "提交答案"
                : composer.mode === "deployment_url"
                  ? "提交 URL"
                  : "发送"}
          </UiButton>
          {canSkip ? (
            <UiButton
              variant="ghost"
              disabled={pending}
              onClick={() => void skip()}
              title="跳过本轮澄清，采用系统默认假设直接生成 PRD"
            >
              跳过并采用默认假设
            </UiButton>
          ) : null}
        </div>
      ) : null}

      {(composer.readOnly || composer.mode === "paused") && !gated ? (
        <p className="text-sm text-[var(--v3-text-muted)]">当前为只读模式，等待工作流推进或人工恢复。</p>
      ) : null}
    </footer>
  );
}
