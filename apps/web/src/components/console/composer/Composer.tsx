"use client";

import { useEffect, useRef, useState } from "react";
import type { ConsoleState } from "../../../store/types";
import type { ConsoleActions } from "../../../hooks/useConsoleState";

/**
 * Composer — the universal input box. Mirrors buildInputBox + computeComposer.
 * Eight modes drive prompt + behaviour:
 *   requirement / question_round / gate_decision / gate_custom /
 *   deployment_url / change_request / paused / read_only
 *
 * Taizi is always reachable: every mode funnels typed text to sendToTaizi.
 * In gate_decision, typing natural language + Enter sends to Taizi instead of
 * picking an option. In question_round, digits 1-9 quick-pick a suggestion
 * (only when input is empty).
 */
export function Composer({
  state,
  actions,
}: {
  state: ConsoleState;
  actions: ConsoleActions;
}) {
  const composer = state.composer;
  const [draft, setDraft] = useState(composer.input);
  const inputRef = useRef<HTMLInputElement>(null);
  const focused = state.focus === "composer";

  // Sync external input changes (e.g. deployment_url auto-fill) into the draft.
  useEffect(() => {
    setDraft(composer.input);
  }, [composer.input]);

  // Keep the composer focused by default.
  useEffect(() => {
    if (focused) inputRef.current?.focus();
  }, [focused]);

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    composer.input = "";

    switch (composer.mode) {
      case "requirement":
        await actions.startRequirement(text);
        return;
      case "gate_custom": {
        const gate = state.snapshot?.openGates[0];
        if (gate) {
          await actions.resolveGate(gate.id, composer.pendingGateDecision ?? "custom", text);
        }
        composer.mode = "gate_decision";
        composer.pendingGateDecision = undefined;
        return;
      }
      case "deployment_url": {
        const gate = state.snapshot?.openGates[0];
        if (gate) await actions.resolveGate(gate.id, "approve", text);
        return;
      }
      case "paused":
        if (/^继续|resume|continue$/i.test(text)) {
          await actions.dispatchAction("pause_resume");
          return;
        }
        await actions.sendToTaizi(text);
        return;
      case "question_round": {
        const idx = composer.questionIndex;
        composer.draftAnswers[idx] = text;
        if (idx < composer.questions.length - 1) {
          composer.questionIndex = idx + 1;
        } else {
          await actions.submitAnswers(composer.draftAnswers);
        }
        return;
      }
      default:
        // change_request / read_only / gate_decision with typed text → Taizi.
        await actions.sendToTaizi(text);
        return;
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Gate custom / question round navigation.
    if (composer.mode === "question_round") {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (composer.questionIndex > 0) composer.questionIndex -= 1;
        setDraft(composer.draftAnswers[composer.questionIndex] ?? "");
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        composer.draftAnswers[composer.questionIndex] = draft;
        if (composer.questionIndex < composer.questions.length - 1) composer.questionIndex += 1;
        setDraft(composer.draftAnswers[composer.questionIndex] ?? "");
        return;
      }
      if (draft === "" && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const suggestion = composer.questions[composer.questionIndex]?.suggestedAnswers[
          Number(e.key) - 1
        ];
        if (suggestion) {
          composer.draftAnswers[composer.questionIndex] = suggestion;
          if (composer.questionIndex < composer.questions.length - 1) composer.questionIndex += 1;
          else void actions.submitAnswers(composer.draftAnswers);
          setDraft("");
        }
        return;
      }
      if (e.key === "k" && draft === "") {
        e.preventDefault();
        void actions.skipClarification();
        return;
      }
      if (e.key === "s" && draft === "") {
        e.preventDefault();
        void actions.submitAnswers(composer.draftAnswers);
        return;
      }
    }

    if (composer.mode === "gate_decision") {
      if (draft === "" && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const opt = composer.gateOptions[Number(e.key) - 1];
        if (opt) {
          if (opt === "custom" || opt === "reject_and_redo") {
            composer.mode = "gate_custom";
            composer.pendingGateDecision = opt;
          } else {
            void actions.resolveGate(composer.gateId!, opt);
          }
        }
        return;
      }
    }

    if (e.key === "Escape") {
      if (composer.mode === "gate_custom") {
        composer.mode = "gate_decision";
        composer.pendingGateDecision = undefined;
        setDraft("");
        return;
      }
      setDraft("");
      composer.input = "";
      state.focus = "composer";
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(e.target.value);
    composer.input = e.target.value;
    if (composer.mode === "question_round") {
      composer.draftAnswers[composer.questionIndex] = e.target.value;
    }
  };

  const reason = state.pendingHint ?? composer.reason;
  const modeLabel: Record<typeof composer.mode, string> = {
    requirement: "需求",
    question_round: `Q${composer.questionIndex + 1}/${composer.questions.length}`,
    gate_decision: "门禁",
    gate_custom: composer.pendingGateDecision === "reject_and_redo" ? "驳回重做" : "自定义",
    deployment_url: "部署 URL",
    change_request: "太子",
    paused: "已暂停",
    read_only: "指令",
  };

  return (
    <div className="border-t border-term-dim/30 px-3 py-2">
      <div className="text-xs text-term-dim mb-1">{reason}</div>
      {composer.mode === "gate_decision" && composer.gateOptions.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {composer.gateOptions.map((opt, i) => (
            <button
              key={opt}
              onClick={() => {
                if (opt === "custom" || opt === "reject_and_redo") {
                  composer.mode = "gate_custom";
                  composer.pendingGateDecision = opt;
                } else {
                  void actions.resolveGate(composer.gateId!, opt);
                }
              }}
              className="text-xs px-2 py-0.5 border border-term-yellow/40 text-term-yellow hover:bg-term-yellow/10"
            >
              {i + 1}. {opt}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="text-term-cyan shrink-0">{modeLabel[composer.mode]} ❯</span>
        <input
          ref={inputRef}
          value={draft}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onFocus={() => (state.focus = "composer")}
          placeholder={composer.mode === "requirement" ? "describe the product requirement…" : ""}
          className="flex-1 bg-transparent border-b border-term-dim/40 focus:border-term-cyan focus:outline-none text-term-fg"
        />
      </div>
    </div>
  );
}
