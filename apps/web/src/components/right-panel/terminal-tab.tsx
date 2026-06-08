"use client";

import { useState } from "react";
import { panelApi } from "@/lib/api";
import { GateCard } from "../gate-card";

type TranscriptLine = {
  kind: "input" | "output" | "error";
  text: string;
};

export function TerminalTab({ projectId }: { projectId: string }) {
  const [cmd, setCmd] = useState("");
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [pending, setPending] = useState(false);
  const [gate, setGate] = useState<{
    gateId: string;
    gateType: string;
    options: string[];
  } | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = cmd.trim();
    if (!trimmed) {
      return;
    }

    setLines((current) => [...current, { kind: "input", text: `$ ${trimmed}` }]);
    setPending(true);
    setGate(null);
    setCmd("");

    try {
      const result = await panelApi.runCommand(projectId, trimmed);
      const output =
        result.outputRef?.kind === "inline"
          ? (result.outputRef.text ?? "")
          : (result.outputRef?.summary ?? "Command completed.");
      setLines((current) => [...current, { kind: "output", text: output }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Command failed";
      const gateId = (error as Error & { gateId?: string }).gateId;
      const gateType = (error as Error & { gateType?: string }).gateType;
      setLines((current) => [...current, { kind: "error", text: message }]);
      if (gateId && gateType) {
        const optionsByType: Record<string, string[]> = {
          dangerous_operation: ["approve", "skip_risk_and_continue", "reject", "custom"],
          deployment: ["approve", "reject", "custom"],
        };
        setGate({
          gateId,
          gateType,
          options: optionsByType[gateType] ?? ["reject"],
        });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex h-full min-h-[420px] flex-col gap-3" data-testid="terminal-tab">
      <div className="min-h-[280px] flex-1 overflow-auto rounded-md border border-[var(--oc-border-muted)] bg-[var(--oc-surface-raised)] p-3 font-mono text-xs">
        {lines.map((line, index) => (
          <p
            key={`${line.kind}-${index}`}
            className={
              line.kind === "error"
                ? "text-[var(--oc-status-danger)]"
                : line.kind === "input"
                  ? "text-[var(--oc-accent-primary)]"
                  : undefined
            }
          >
            {line.text}
          </p>
        ))}
      </div>

      {gate ? (
        <GateCard
          gateId={gate.gateId}
          gateType={gate.gateType}
          title="Command blocked by gate"
          description="Resolve the gate before retrying the command."
          options={gate.options}
          status="open"
          onResolve={async ({ decision, customText }) => {
            await panelApi.resolveGate(gate.gateId, decision, customText);
            setGate(null);
          }}
        />
      ) : null}

      <form onSubmit={(event) => void handleSubmit(event)} className="flex gap-2">
        <input
          className="flex-1 rounded-md border border-[var(--oc-border-muted)] px-3 py-2 text-sm"
          value={cmd}
          onChange={(event) => setCmd(event.target.value)}
          placeholder="Run a governed command (e.g. ls)"
          aria-label="Terminal command"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--oc-accent-primary)] px-4 py-2 text-sm text-white"
        >
          Run
        </button>
      </form>
    </div>
  );
}
