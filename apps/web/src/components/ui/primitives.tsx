"use client";

import type { ReactNode } from "react";
import { strWidth } from "../../lib/format/text";

/** A bordered box mirroring the TUI's ╭─...─╮ / │ │ / ╰─...─╯ framing. */
export function Box({
  title,
  tint = "text-term-dim",
  border = "border-term-dim/40",
  className,
  children,
}: {
  title?: ReactNode;
  tint?: string;
  border?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`border ${border} rounded-sm ${className ?? ""}`}>
      {title !== undefined && (
        <div className={`flex items-center gap-2 px-2 py-0.5 border-b ${border} ${tint}`}>
          <span className="shrink-0">{title}</span>
        </div>
      )}
      <div className="px-2 py-1">{children}</div>
    </div>
  );
}

/** A horizontal section rule with an optional centered label. */
export function Rule({ label, className }: { label?: string; className?: string }) {
  if (!label) return <div className={`border-t border-term-dim/30 my-1 ${className ?? ""}`} />;
  return (
    <div className={`flex items-center gap-2 my-1 ${className ?? ""}`}>
      <span className="text-term-dim text-xs">─ {label} ─</span>
      <span className="flex-1 border-t border-term-dim/30" />
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  cyan: "text-term-cyan",
  green: "text-term-green",
  yellow: "text-term-yellow",
  red: "text-term-red",
  magenta: "text-term-magenta",
  blue: "text-term-blue",
  dim: "text-term-dim",
};

/** Colored badge for a project status — mirrors statusBadge() in render.ts. */
export function statusColor(status: string): string {
  switch (status) {
    case "Draft Requirement":
    case "Asking Questions":
      return "cyan";
    case "PRD Ready":
    case "Delivered":
      return "green";
    case "Tech Plan Review":
    case "Change Review":
    case "Awaiting Acceptance":
      return "yellow";
    case "Developing":
    case "Testing":
    case "Deploying":
      return "blue";
    case "Failed":
      return "red";
    case "Paused":
      return "magenta";
    default:
      return "dim";
  }
}

export function StatusBadge({ status }: { status: string }) {
  const color = statusColor(status);
  return <span className={`font-bold ${STATUS_COLORS[color]}`}>{status}</span>;
}

/** Braille spinner — mirrors the TUI's spinner() at 100ms tick. */
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
export function Spinner({ className }: { className?: string }) {
  const i = Math.floor(Date.now() / 100) % SPINNER_FRAMES.length;
  return <span className={className ?? "text-term-cyan inline-block w-3"}>{SPINNER_FRAMES[i]}</span>;
}

/** Mono key/value row for the inspector project panel. */
export function KV({ label, value, mono }: { label: string; value?: ReactNode; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="text-term-dim shrink-0">{label}</span>
      <span className={mono ? "font-mono break-all" : "break-all"}>{value ?? "—"}</span>
    </div>
  );
}

/** Display-width-aware ellipsis clip (for one-line summaries). */
export function Clip({ text, width, className }: { text: string; width: number; className?: string }) {
  const clipped = strWidth(text) > width ? "…" + text.slice(-Math.max(0, width - 1)) : text;
  return <span className={className}>{clipped}</span>;
}
