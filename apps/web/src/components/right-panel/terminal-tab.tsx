"use client";

import { useState } from "react";
import { Terminal } from "lucide-react";
import { panelApi } from "@/lib/api";
import { GateCard } from "../gate-card";
import {
  UiButton,
  UiInput,
  UiLogBlock,
  UiSectionHeading,
} from "@/components/ui-v2/primitives";

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
        const openGates = await panelApi.listOpenGates(projectId);
        const gateRecord = openGates.gates.find((item) => item.id === gateId);
        setGate({
          gateId,
          gateType,
          options: gateRecord?.options ?? [],
        });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex h-full min-h-[420px] flex-col gap-3" data-testid="terminal-tab">
      <UiSectionHeading
        title="Governed terminal"
        description="Commands remain subject to project risk policy and human gates."
      />
      <UiLogBlock className="min-h-[280px] flex-1">
        {lines.length === 0 ? (
          <div className="flex min-h-[250px] flex-col items-center justify-center gap-2 text-center text-[var(--oc-text-on-code)]/70">
            <Terminal className="size-5" />
            <p className="text-sm font-medium">No command output yet</p>
            <p className="text-xs">Run a governed command to start a transcript.</p>
          </div>
        ) : (
          lines.map((line, index) => (
            <div
              key={`${line.kind}-${index}`}
              className={
                line.kind === "error"
                  ? "text-[var(--oc-status-danger)]"
                  : line.kind === "input"
                    ? "text-[var(--oc-status-warning)]"
                    : undefined
              }
            >
              {line.text}
            </div>
          ))
        )}
      </UiLogBlock>

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
        <UiInput
          className="flex-1"
          value={cmd}
          onChange={(event) => setCmd(event.target.value)}
          placeholder="Run a governed command (e.g. ls)"
          aria-label="Terminal command"
        />
        <UiButton
          type="submit"
          disabled={pending}
          variant="primary"
        >
          {pending ? "Running" : "Run"}
        </UiButton>
      </form>
    </div>
  );
}
