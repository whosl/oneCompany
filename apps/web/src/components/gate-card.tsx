"use client";

import { useState } from "react";
import { formatGateOptionLabel } from "../lib/gates";
import { UiButton, UiPanel } from "./ui-v2/primitives";

export type GateCardProps = {
  gateId: string;
  gateType: string;
  title: string;
  description: string;
  options: readonly string[];
  status: "open" | "resolved";
  decision?: string | null;
  onResolve: (input: { decision: string; customText?: string }) => Promise<void>;
};

export function GateCard({
  gateId,
  gateType,
  title,
  description,
  options,
  status,
  decision,
  onResolve,
}: GateCardProps) {
  const [customText, setCustomText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allowsCustom = options.includes("custom");

  if (status === "resolved") {
    return (
      <UiPanel className="p-4" data-gate-id={gateId}>
        <h2 className="font-medium">{title}</h2>
        <p className="text-sm text-[var(--oc-text-muted)]">{gateType}</p>
        <p className="mt-2 text-sm">Resolved: {decision}</p>
      </UiPanel>
    );
  }

  async function handleResolve(decision: string) {
    setPending(true);
    setError(null);
    try {
      await onResolve({
        decision,
        customText: decision === "custom" ? customText : undefined,
      });
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : "Failed to resolve gate");
    } finally {
      setPending(false);
    }
  }

  return (
    <UiPanel
      className="border-[var(--oc-status-warning)]/50 bg-[var(--oc-status-warning)]/10 p-4"
      data-gate-id={gateId}
    >
      <h2 className="text-sm font-semibold text-[var(--oc-text-primary)]">{title}</h2>
      <p className="mt-1 text-sm text-[var(--oc-text-muted)]">{description}</p>
      <p className="mt-1 text-xs text-[var(--oc-status-warning)]">{gateType}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {options
          .filter((option) => option !== "custom")
          .map((option) => (
            <UiButton
              key={option}
              type="button"
              variant={option === "reject" ? "danger" : "secondary"}
              size="sm"
              disabled={pending}
              onClick={() => void handleResolve(option)}
            >
              {formatGateOptionLabel(option)}
            </UiButton>
          ))}
      </div>

      {allowsCustom ? (
        <div className="mt-4 flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor={`${gateId}-custom`}>
            Custom instruction
          </label>
          <textarea
            id={`${gateId}-custom`}
            className="min-h-20 rounded-md border border-[var(--oc-border-muted)] bg-[var(--oc-surface-base)] px-3 py-2 text-sm outline-none focus:border-[var(--oc-border-active)] focus:ring-2 focus:ring-[var(--oc-border-active)]/20"
            value={customText}
            onChange={(event) => setCustomText(event.target.value)}
            placeholder="Attach custom text to an allowed gate decision"
          />
          <UiButton
            type="button"
            variant="primary"
            disabled={pending || customText.trim().length === 0}
            onClick={() => void handleResolve("custom")}
          >
            Submit custom
          </UiButton>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-[var(--oc-status-danger)]">{error}</p> : null}
    </UiPanel>
  );
}
