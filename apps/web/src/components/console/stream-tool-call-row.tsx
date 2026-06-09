"use client";

import { useState } from "react";

export function StreamToolCallRow({
  title,
  summary,
  status,
  artifactPath,
  onOpenTerminal,
}: {
  title: string;
  summary: string;
  status: "started" | "output" | "failed";
  artifactPath?: string;
  onOpenTerminal?: () => void;
}) {
  const [expanded, setExpanded] = useState(status === "failed");

  return (
    <article
      className="rounded-md border border-[var(--oc-border-muted)] bg-[var(--oc-surface-raised)] p-3"
      data-testid="stream-tool-call-row"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between text-left text-xs font-semibold uppercase tracking-wide text-[var(--oc-text-muted)]"
        onClick={() => setExpanded((open) => !open)}
      >
        <span>{title}</span>
        <span>{expanded ? "−" : "+"}</span>
      </button>
      {!expanded ? (
        <p className="mt-1 text-sm text-[var(--oc-text-muted)]">{summary.slice(0, 120)}</p>
      ) : (
        <pre className="mt-2 overflow-auto text-sm whitespace-pre-wrap">{summary}</pre>
      )}
      {artifactPath ? (
        <button
          type="button"
          className="mt-2 text-xs text-[var(--oc-accent-primary)] underline"
          onClick={onOpenTerminal}
        >
          View full output in Terminal ({artifactPath})
        </button>
      ) : null}
    </article>
  );
}
