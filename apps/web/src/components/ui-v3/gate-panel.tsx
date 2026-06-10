"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { UiButton } from "../ui-v2/primitives";
import type { UiV3GateView } from "./types";

function GateCard({
  gate,
  disabled,
  onResolve,
}: {
  gate: UiV3GateView;
  disabled?: boolean;
  onResolve?: (gateId: string, decision: string, customText?: string) => Promise<void>;
}) {
  const [customText, setCustomText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allowsCustom = gate.options.some((option) => option.id === "custom");

  async function resolve(decision: string) {
    if (!onResolve || disabled || pending) return;
    setError(null);
    setPending(true);
    try {
      await onResolve(
        gate.id,
        decision,
        decision === "custom" ? customText.trim() || undefined : undefined,
      );
      setCustomText("");
    } catch (resolveError) {
      setError(
        resolveError instanceof Error ? resolveError.message : "Gate 操作失败，请稍后重试",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <article
      className={[
        "rounded-lg border p-4",
        gate.isBlocking
          ? "border-[var(--v3-warning)] bg-[var(--v3-warning)]/8 shadow-sm"
          : "border-[var(--v3-border)] bg-[var(--v3-surface-subtle)]",
      ].join(" ")}
      data-testid="ui-v3-gate"
      data-gate-id={gate.id}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[var(--v3-warning)]" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--v3-warning)]">
              确认点 · {gate.type}
              {gate.isBlocking ? " · 阻塞中" : ""}
            </p>
            <h3 className="mt-1 text-base font-semibold">{gate.title}</h3>
            <p className="mt-1 text-sm text-[var(--v3-text-muted)]">{gate.description}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-[var(--v3-danger)]/30 bg-[var(--v3-danger)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--v3-danger)]">
          {gate.risk} risk
        </span>
      </div>

      {gate.command ? (
        <pre className="mt-3 overflow-auto rounded-md bg-[var(--oc-surface-code)] p-3 font-mono text-xs text-[var(--oc-text-on-code)]">
          {gate.command}
        </pre>
      ) : null}

      {allowsCustom ? (
        <textarea
          className="mt-3 w-full rounded-md border border-[var(--v3-border)] bg-[var(--v3-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--v3-accent)]"
          rows={2}
          value={customText}
          onChange={(event) => setCustomText(event.target.value)}
          placeholder="自定义意见（选择 custom 时附带）"
          disabled={disabled || pending}
        />
      ) : null}

      {error ? (
        <p className="mt-3 rounded-md border border-[var(--v3-danger)]/35 bg-[var(--v3-danger)]/8 px-3 py-2 text-sm text-[var(--v3-danger)]">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {gate.options.map((option) => (
          <UiButton
            key={option.id}
            type="button"
            variant={
              option.tone === "primary"
                ? "primary"
                : option.tone === "danger"
                  ? "danger"
                  : "secondary"
            }
            size="sm"
            disabled={disabled || pending || !onResolve}
            onClick={() => void resolve(option.id)}
          >
            {pending ? "处理中…" : option.label}
          </UiButton>
        ))}
      </div>
    </article>
  );
}

export function GatePanel({
  gates,
  disabled,
  onResolve,
}: {
  gates: UiV3GateView[];
  disabled?: boolean;
  onResolve?: (gateId: string, decision: string, customText?: string) => Promise<void>;
}) {
  if (gates.length === 0) return null;

  return (
    <section className="space-y-3" data-testid="ui-v3-gate-panel">
      <header>
        <h2 className="text-sm font-semibold">待你确认</h2>
        <p className="text-xs text-[var(--v3-text-muted)]">
          {gates.length} 个 open gate · 阻塞项优先展示
        </p>
      </header>
      {[...gates]
        .sort((left, right) => Number(right.isBlocking) - Number(left.isBlocking))
        .map((gate) => (
          <GateCard key={gate.id} gate={gate} disabled={disabled} onResolve={onResolve} />
        ))}
    </section>
  );
}
