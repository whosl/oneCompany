"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { formatGateOptionLabel } from "../lib/gates";

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
      <article className="rounded-md border bg-muted/40 p-4" data-gate-id={gateId}>
        <h2 className="font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">{gateType}</p>
        <p className="mt-2 text-sm">Resolved: {decision}</p>
      </article>
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
    <article className="rounded-md border bg-card p-4 shadow-sm" data-gate-id={gateId}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{gateType}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {options
          .filter((option) => option !== "custom")
          .map((option) => (
            <Button
              key={option}
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => void handleResolve(option)}
            >
              {formatGateOptionLabel(option)}
            </Button>
          ))}
      </div>

      {allowsCustom ? (
        <div className="mt-4 flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor={`${gateId}-custom`}>
            Custom instruction
          </label>
          <textarea
            id={`${gateId}-custom`}
            className="min-h-20 rounded-md border px-3 py-2 text-sm"
            value={customText}
            onChange={(event) => setCustomText(event.target.value)}
            placeholder="Attach custom text to an allowed gate decision"
          />
          <Button
            type="button"
            disabled={pending || customText.trim().length === 0}
            onClick={() => void handleResolve("custom")}
          >
            Submit custom
          </Button>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </article>
  );
}
