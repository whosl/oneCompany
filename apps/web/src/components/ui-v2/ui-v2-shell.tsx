"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Boxes,
  ChevronRight,
  CircleDot,
  FileCode2,
  MonitorPlay,
  Pause,
  Play,
  Send,
  ShieldAlert,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { uiV2Fixture } from "./fixture";
import type {
  AgentRun,
  AgentRunGroup,
  AgentRunStatus,
  AgentStepName,
  ConsoleMode,
  StreamItem,
  SwimlaneCell,
  UiV2Projection,
  UiV2ComposerMode,
  WorkspaceTabId,
} from "./types";

const WORKSPACE_TABS: WorkspaceTabId[] = ["Files", "Preview", "Terminal", "Tests", "Report"];
const STEPS: AgentStepName[] = ["Plan", "Act", "Observe", "Reflect"];

const statusClass: Record<AgentRunStatus, string> = {
  completed:
    "border-[var(--oc-status-success)]/45 bg-[var(--oc-status-success)]/10 text-[var(--oc-status-success)]",
  running:
    "border-[var(--oc-accent-primary)]/55 bg-[var(--oc-accent-soft)] text-[var(--oc-accent-primary)]",
  waiting:
    "border-[var(--oc-status-warning)]/45 bg-[var(--oc-status-warning)]/10 text-[var(--oc-status-warning)]",
  gated:
    "border-[var(--oc-status-warning)]/65 bg-[var(--oc-status-warning)]/15 text-[var(--oc-status-warning)]",
  failed:
    "border-[var(--oc-status-danger)]/55 bg-[var(--oc-status-danger)]/10 text-[var(--oc-status-danger)]",
  pending:
    "border-[var(--oc-border-muted)] bg-[var(--oc-surface-raised)] text-[var(--oc-text-muted)]",
};

function StatusPill({ status, label = status }: { status: AgentRunStatus; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        statusClass[status],
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

export type UiV2Actions = {
  onPauseResume?: () => void;
  onDeploy?: () => void;
  onComposerSubmit?: (mode: UiV2ComposerMode, text: string) => Promise<void> | void;
  onResolveGate?: (decision: string, customText?: string) => Promise<void> | void;
};

function TopNavigation({
  projection,
  actions,
}: {
  projection: UiV2Projection;
  actions?: UiV2Actions;
}) {
  const paused = projection.project.status === "Paused";
  return (
    <header className="flex min-h-16 shrink-0 flex-wrap items-center gap-3 border-b border-[var(--oc-border-muted)] bg-[var(--oc-surface-base)] px-4 py-3 lg:h-16 lg:flex-nowrap lg:px-5 lg:py-0">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--oc-accent-primary)] text-xs font-bold text-white">
          OC
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[var(--oc-text-primary)]">OneCompany</div>
          <div className="text-xs text-[var(--oc-text-muted)]">Multi-agent app factory</div>
        </div>
      </div>

      <button
        type="button"
        className="flex h-9 w-full min-w-0 items-center justify-between rounded-md border border-[var(--oc-border-muted)] bg-[var(--oc-surface-base)] px-3 text-sm sm:w-72 lg:ml-8"
      >
        <span className="truncate">{projection.project.name}</span>
        <ChevronRight className="size-4 text-[var(--oc-text-muted)]" />
      </button>

      <div className="flex min-w-0 flex-wrap items-center gap-2 lg:ml-5">
        <span className="rounded-full border border-[var(--oc-border-muted)] px-3 py-1 text-xs text-[var(--oc-text-primary)]">
          {projection.project.status}
        </span>
        <span className="rounded-full border border-[var(--oc-border-muted)] px-3 py-1 text-xs text-[var(--oc-text-primary)]">
          {projection.project.activeGroup}
        </span>
        <span className="rounded-full border border-[var(--oc-accent-primary)]/45 bg-[var(--oc-accent-soft)] px-3 py-1 text-xs text-[var(--oc-accent-primary)]">
          {projection.project.progress}
        </span>
        <span className="rounded-full border border-[var(--oc-status-warning)]/45 bg-[var(--oc-status-warning)]/10 px-3 py-1 text-xs text-[var(--oc-status-warning)]">
          {projection.orchestration.blocker}
        </span>
      </div>

      <div className="ml-0 flex items-center gap-2 lg:ml-auto">
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--oc-border-muted)] px-3 text-sm"
          onClick={actions?.onPauseResume}
          disabled={!actions?.onPauseResume}
        >
          {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          {paused ? "Resume" : "Pause"}
        </button>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--oc-accent-primary)] px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          onClick={actions?.onDeploy}
          disabled={!actions?.onDeploy || projection.project.status === "Paused"}
        >
          <Play className="size-4" />
          Deploy
        </button>
        <button
          type="button"
          className="ml-2 flex size-9 items-center justify-center rounded-full border border-[var(--oc-border-muted)] bg-[var(--oc-surface-warm)] text-sm font-semibold"
        >
          W
        </button>
      </div>
    </header>
  );
}

function OrchestrationStrip({ projection }: { projection: UiV2Projection }) {
  return (
    <section
      className="border-b border-[var(--oc-border-muted)] bg-[var(--oc-surface-base)] px-4 py-3"
      data-testid="orchestration-strip"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--oc-text-primary)]">
            <span className="inline-flex items-center gap-1">
              <Boxes className="size-4 text-[var(--oc-accent-primary)]" />
              Orchestrator Agent
            </span>
            <ChevronRight className="size-4 text-[var(--oc-text-muted)]" />
            <span>{projection.orchestration.activeGroup}</span>
            <ChevronRight className="size-4 text-[var(--oc-text-muted)]" />
            <span>{projection.orchestration.activeAgent}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--oc-text-muted)]">
            <span>{projection.orchestration.unit}</span>
            <span className="text-[var(--oc-border-muted)]">/</span>
            <span>{projection.orchestration.phase}</span>
            <span className="text-[var(--oc-border-muted)]">/</span>
            <span className="font-medium text-[var(--oc-status-warning)]">
              {projection.orchestration.blocker}
            </span>
          </div>
        </div>
        <div className="max-w-sm rounded-md border border-[var(--oc-status-warning)]/45 bg-[var(--oc-status-warning)]/10 px-3 py-2 text-xs text-[var(--oc-text-primary)]">
          <div className="font-semibold text-[var(--oc-status-warning)]">Next action</div>
          <div>{projection.orchestration.nextAction}</div>
        </div>
      </div>
    </section>
  );
}

function ModeSwitcher({
  mode,
  onModeChange,
}: {
  mode: ConsoleMode;
  onModeChange: (mode: ConsoleMode) => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--oc-border-muted)] px-4 py-3">
      <div>
        <h1 className="text-base font-semibold text-[var(--oc-text-primary)]">Agent Console</h1>
        <p className="text-xs text-[var(--oc-text-muted)]">
          Default stream, switchable mission swimlane
        </p>
      </div>
      <div className="grid grid-cols-2 rounded-md border border-[var(--oc-border-muted)] bg-[var(--oc-surface-raised)] p-1">
        {(["stream", "swimlane"] as const).map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={cn(
              "h-8 rounded px-3 text-xs font-medium capitalize",
              mode === candidate
                ? "bg-[var(--oc-accent-soft)] text-[var(--oc-accent-primary)]"
                : "text-[var(--oc-text-muted)] hover:text-[var(--oc-text-primary)]",
            )}
            onClick={() => onModeChange(candidate)}
          >
            {candidate}
          </button>
        ))}
      </div>
    </div>
  );
}

function RequirementSnapshot({ projection }: { projection: UiV2Projection }) {
  return (
    <section className="rounded-lg border border-[var(--oc-border-muted)] bg-[var(--oc-surface-base)] p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase text-[var(--oc-text-muted)]">
            Requirement snapshot
          </div>
          <p className="mt-2 text-sm font-medium text-[var(--oc-text-primary)]">
            {projection.requirementSnapshot.normalized}
          </p>
          <p className="mt-1 text-xs text-[var(--oc-text-muted)]">
            Raw: {projection.requirementSnapshot.raw}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-3xl font-semibold text-[var(--oc-accent-primary)]">
            {projection.requirementSnapshot.score}
          </div>
          <div className="text-xs text-[var(--oc-text-muted)]">locked score</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {projection.requirementSnapshot.facts.map((fact, index) => (
          <span
            key={`${fact}-${index}`}
            className="rounded-full border border-[var(--oc-status-success)]/45 bg-[var(--oc-status-success)]/10 px-2 py-1 text-xs text-[var(--oc-status-success)]"
          >
            {fact}
          </span>
        ))}
        {projection.requirementSnapshot.upcoming.map((item, index) => (
          <span
            key={`${item}-${index}`}
            className="rounded-full border border-[var(--oc-accent-primary)]/45 bg-[var(--oc-accent-soft)] px-2 py-1 text-xs text-[var(--oc-accent-primary)]"
          >
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}

function RunCard({
  run,
  selected,
  onSelect,
  onOpenTab,
}: {
  run: AgentRun;
  selected: boolean;
  onSelect: (id: string) => void;
  onOpenTab: (tab: WorkspaceTabId) => void;
}) {
  return (
    <article
      className={cn(
        "rounded-lg border bg-[var(--oc-surface-base)] p-4 transition",
        selected
          ? "border-[var(--oc-accent-primary)] shadow-sm"
          : "border-[var(--oc-border-muted)]",
      )}
      style={{ contentVisibility: "auto", containIntrinsicSize: "220px" }}
    >
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 text-left"
        onClick={() => onSelect(run.id)}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-[var(--oc-text-primary)]">{run.agentName}</span>
            <StatusPill status={run.status} />
            <span className="text-xs text-[var(--oc-text-muted)]">{run.role}</span>
          </div>
          <p className="mt-1 text-sm text-[var(--oc-text-primary)]">{run.summary}</p>
        </div>
        <span className="rounded-full bg-[var(--oc-surface-raised)] px-2 py-1 text-xs text-[var(--oc-text-muted)]">
          {run.currentStep}
        </span>
      </button>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {run.steps.map((step) => (
          <div
            key={step.name}
            className={cn(
              "min-h-20 rounded-md border p-2 text-xs",
              step.status === "gated" || step.status === "failed"
                ? statusClass[step.status]
                : step.name === run.currentStep
                  ? "border-[var(--oc-accent-primary)]/50 bg-[var(--oc-accent-soft)] text-[var(--oc-text-primary)]"
                  : "border-[var(--oc-border-muted)] bg-[var(--oc-surface-raised)] text-[var(--oc-text-muted)]",
            )}
          >
            <div className="mb-1 font-semibold">{step.name}</div>
            <div>{step.summary}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {run.tools.map((tool, index) => (
          <button
            key={`${tool}-${index}`}
            type="button"
            className="rounded-full border border-[var(--oc-border-muted)] px-2 py-1 text-xs text-[var(--oc-text-muted)]"
            onClick={() => onOpenTab("Terminal")}
          >
            tool: {tool}
          </button>
        ))}
        {run.diffs.map((diff, index) => (
          <button
            key={`${diff}-${index}`}
            type="button"
            className="rounded-full border border-[var(--oc-border-muted)] px-2 py-1 text-xs text-[var(--oc-text-muted)]"
            onClick={() => onOpenTab("Files")}
          >
            diff: {diff}
          </button>
        ))}
        {run.tests.map((test, index) => (
          <button
            key={`${test}-${index}`}
            type="button"
            className="rounded-full border border-[var(--oc-border-muted)] px-2 py-1 text-xs text-[var(--oc-text-muted)]"
            onClick={() => onOpenTab("Tests")}
          >
            test: {test}
          </button>
        ))}
      </div>
    </article>
  );
}

function StreamEventRow({
  item,
  onSelectRun,
  onOpenTab,
}: {
  item: StreamItem;
  onSelectRun: (id: string) => void;
  onOpenTab: (tab: WorkspaceTabId) => void;
}) {
  const severityTone =
    item.severity === "danger"
      ? "border-[var(--oc-status-danger)]/45 bg-[var(--oc-status-danger)]/10"
      : item.severity === "warning"
        ? "border-[var(--oc-status-warning)]/45 bg-[var(--oc-status-warning)]/10"
        : item.severity === "success"
          ? "border-[var(--oc-status-success)]/35 bg-[var(--oc-status-success)]/10"
          : item.type === "user"
            ? "border-[var(--oc-accent-primary)]/35 bg-[var(--oc-surface-warm)]"
            : "border-[var(--oc-border-muted)] bg-[var(--oc-surface-base)]";

  return (
    <article
      className={cn("rounded-lg border px-3 py-2", severityTone)}
      style={{ contentVisibility: "auto", containIntrinsicSize: "88px" }}
      data-testid={`ui-v2-event-${item.seq}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase text-[var(--oc-text-muted)]">
            {item.title}
          </div>
          <p className="mt-1 text-sm text-[var(--oc-text-primary)]">{item.summary}</p>
        </div>
        <span className="shrink-0 text-right text-xs text-[var(--oc-text-muted)]">
          <span className="block font-mono">#{item.seq}</span>
          <span>{item.timestamp}</span>
        </span>
      </div>
      <div className="mt-2 flex gap-2">
        {item.runId ? (
          <button
            type="button"
            className="text-xs font-medium text-[var(--oc-accent-primary)] underline"
            onClick={() => onSelectRun(item.runId ?? "")}
          >
            Select run
          </button>
        ) : null}
        {item.tab ? (
          <button
            type="button"
            className="text-xs font-medium text-[var(--oc-accent-primary)] underline"
            onClick={() => onOpenTab(item.tab ?? "Files")}
          >
            Open {item.tab}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function HistoricalRunRow({
  run,
  selected,
  onSelect,
  onOpenTab,
}: {
  run: AgentRun;
  selected: boolean;
  onSelect: (id: string) => void;
  onOpenTab: (tab: WorkspaceTabId) => void;
}) {
  const [expanded, setExpanded] = useState(run.status === "failed");
  return (
    <details
      className={cn(
        "rounded-md border bg-[var(--oc-surface-base)]",
        selected ? "border-[var(--oc-accent-primary)]" : "border-[var(--oc-border-muted)]",
      )}
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      style={{ contentVisibility: "auto", containIntrinsicSize: "64px" }}
    >
      <summary className="cursor-pointer list-none px-3 py-2" onClick={() => onSelect(run.id)}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-[var(--oc-text-primary)]">
                {run.agentName}
              </span>
              <StatusPill status={run.status} />
              <span className="text-xs text-[var(--oc-text-muted)]">{run.role}</span>
            </div>
            <p className="mt-1 truncate text-xs text-[var(--oc-text-muted)]">{run.summary}</p>
          </div>
          <span className="shrink-0 font-mono text-xs text-[var(--oc-text-muted)]">
            #{run.firstSeq}-#{run.lastSeq}
          </span>
        </div>
      </summary>
      <div className="border-t border-[var(--oc-border-muted)] p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {run.steps.map((step) => (
            <div
              key={step.name}
              className={cn(
                "rounded-md border p-2 text-xs",
                step.status === "failed"
                  ? statusClass.failed
                  : "border-[var(--oc-border-muted)] bg-[var(--oc-surface-raised)] text-[var(--oc-text-muted)]",
              )}
            >
              <span className="font-semibold">{step.name}</span>
              <span className="ml-2">{step.summary}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {run.tools.length ? (
            <button
              type="button"
              className="text-xs text-[var(--oc-accent-primary)] underline"
              onClick={() => onOpenTab("Terminal")}
            >
              Open {run.tools.length} tool calls
            </button>
          ) : null}
          {run.diffs.length ? (
            <button
              type="button"
              className="text-xs text-[var(--oc-accent-primary)] underline"
              onClick={() => onOpenTab("Files")}
            >
              Open {run.diffs.length} diffs
            </button>
          ) : null}
          {run.tests.length ? (
            <button
              type="button"
              className="text-xs text-[var(--oc-accent-primary)] underline"
              onClick={() => onOpenTab("Tests")}
            >
              Open {run.tests.length} tests
            </button>
          ) : null}
        </div>
      </div>
    </details>
  );
}

function HistoricalRunGroup({
  group,
  runs,
  selectedRunId,
  onSelectRun,
  onOpenTab,
}: {
  group: AgentRunGroup;
  runs: AgentRun[];
  selectedRunId: string;
  onSelectRun: (id: string) => void;
  onOpenTab: (tab: WorkspaceTabId) => void;
}) {
  const [expanded, setExpanded] = useState(group.failedCount > 0);
  const [visibleCount, setVisibleCount] = useState(6);
  const visibleRuns = runs.slice(0, visibleCount);

  return (
    <details
      className="rounded-lg border border-[var(--oc-border-muted)] bg-[var(--oc-surface-raised)]"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      data-testid={`ui-v2-run-group-${group.id}`}
    >
      <summary className="cursor-pointer list-none px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--oc-text-primary)]">
              {group.label}
            </span>
            <StatusPill status={group.status} />
          </div>
          <span className="text-xs text-[var(--oc-text-muted)]">
            {runs.length} runs{group.failedCount ? ` / ${group.failedCount} failed` : ""}
          </span>
        </div>
      </summary>
      <div className="space-y-2 border-t border-[var(--oc-border-muted)] p-2">
        {visibleRuns.map((run) => (
          <HistoricalRunRow
            key={run.id}
            run={run}
            selected={run.id === selectedRunId}
            onSelect={onSelectRun}
            onOpenTab={onOpenTab}
          />
        ))}
        {visibleCount < runs.length ? (
          <button
            type="button"
            className="w-full rounded-md border border-[var(--oc-border-muted)] px-3 py-2 text-xs text-[var(--oc-accent-primary)]"
            onClick={() => setVisibleCount((count) => count + 10)}
          >
            Show {Math.min(10, runs.length - visibleCount)} more runs
          </button>
        ) : null}
      </div>
    </details>
  );
}

function GateCard({
  projection,
  onResolveGate,
}: {
  projection: UiV2Projection;
  onResolveGate?: UiV2Actions["onResolveGate"];
}) {
  const gate = projection.openGate;
  const [customText, setCustomText] = useState("");

  if (!gate) return null;

  return (
    <section
      className="rounded-lg border border-[var(--oc-status-warning)]/60 bg-[var(--oc-status-warning)]/10 p-4"
      data-testid="ui-v2-gate"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--oc-status-warning)]">
            <ShieldAlert className="size-4" />
            Human gate - {gate.type}
          </div>
          <h2 className="mt-2 text-base font-semibold text-[var(--oc-text-primary)]">
            {gate.title}
          </h2>
          <p className="mt-1 text-sm text-[var(--oc-text-primary)]">{gate.description}</p>
        </div>
        <span className="rounded-full border border-[var(--oc-status-danger)]/45 bg-[var(--oc-status-danger)]/10 px-2 py-1 text-xs font-medium text-[var(--oc-status-danger)]">
          {gate.risk} risk
        </span>
      </div>
      {gate.command ? (
        <pre className="mt-3 overflow-auto rounded-md bg-[var(--oc-text-primary)] p-3 font-mono text-xs text-[var(--oc-surface-base)]">
          {gate.command}
        </pre>
      ) : null}
      {onResolveGate ? (
        <input
          className="mt-3 w-full rounded-md border border-[var(--oc-border-muted)] bg-[var(--oc-surface-base)] px-3 py-2 text-sm outline-none focus:border-[var(--oc-accent-primary)]"
          value={customText}
          onChange={(event) => setCustomText(event.target.value)}
          placeholder="Optional note attached to the selected decision"
          aria-label="Gate decision note"
        />
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {gate.options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={cn(
              "rounded-md px-3 py-2 text-xs font-semibold",
              option.tone === "primary"
                ? "bg-[var(--oc-accent-primary)] text-white"
                : option.tone === "danger"
                  ? "border border-[var(--oc-status-danger)] text-[var(--oc-status-danger)]"
                  : "border border-[var(--oc-border-muted)] bg-[var(--oc-surface-base)] text-[var(--oc-text-primary)]",
            )}
            onClick={() => void onResolveGate?.(option.id, customText.trim() || undefined)}
            disabled={!onResolveGate}
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function StreamModeView({
  projection,
  runs,
  selectedRunId,
  onSelectRun,
  onOpenTab,
  onResolveGate,
  initialScrollTop,
  onScrollPositionChange,
}: {
  projection: UiV2Projection;
  runs: AgentRun[];
  selectedRunId: string;
  onSelectRun: (id: string) => void;
  onOpenTab: (tab: WorkspaceTabId) => void;
  onResolveGate?: UiV2Actions["onResolveGate"];
  initialScrollTop: number;
  onScrollPositionChange: (scrollTop: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [visibleEventCount, setVisibleEventCount] = useState(30);
  const runById = useMemo(() => new Map(runs.map((run) => [run.id, run])), [runs]);
  const currentRunIds = useMemo(
    () => new Set(projection.currentWork.relatedRunIds),
    [projection.currentWork.relatedRunIds],
  );
  const currentRuns = projection.currentWork.relatedRunIds.flatMap((runId) => {
    const run = runById.get(runId);
    return run ? [run] : [];
  });
  const eventStart = Math.max(0, projection.streamItems.length - visibleEventCount);
  const visibleEvents = projection.streamItems.slice(eventStart);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = initialScrollTop;
  }, [initialScrollTop]);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="ui-v2-stream">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-4 overflow-auto p-4"
        onScroll={(event) => onScrollPositionChange(event.currentTarget.scrollTop)}
        data-testid="ui-v2-stream-scroll"
      >
        <RequirementSnapshot projection={projection} />
        <section className="space-y-3" data-testid="ui-v2-current-work">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase text-[var(--oc-text-muted)]">
                Current work
              </div>
              <p className="mt-1 text-sm text-[var(--oc-text-primary)]">
                {projection.currentWork.summary}
              </p>
            </div>
            <StatusPill status={projection.currentWork.status} />
          </div>
          {currentRuns.map((run) => (
            <RunCard
              key={run.id}
              run={run}
              selected={run.id === selectedRunId}
              onSelect={onSelectRun}
              onOpenTab={onOpenTab}
            />
          ))}
          <GateCard projection={projection} onResolveGate={onResolveGate} />
        </section>

        <section className="space-y-3" data-testid="ui-v2-run-history">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase text-[var(--oc-text-muted)]">
              Run history
            </div>
            <span className="text-xs text-[var(--oc-text-muted)]">
              {runs.length - currentRuns.length} archived
            </span>
          </div>
          {projection.runGroups.map((group) => {
            const historicalRuns = group.runIds
              .filter((runId) => !currentRunIds.has(runId))
              .flatMap((runId) => {
                const run = runById.get(runId);
                return run ? [run] : [];
              });
            if (!historicalRuns.length) return null;
            return (
              <HistoricalRunGroup
                key={group.id}
                group={group}
                runs={historicalRuns}
                selectedRunId={selectedRunId}
                onSelectRun={onSelectRun}
                onOpenTab={onOpenTab}
              />
            );
          })}
        </section>

        <section className="space-y-2" data-testid="ui-v2-event-history">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase text-[var(--oc-text-muted)]">
              Event history
            </div>
            <span className="font-mono text-xs text-[var(--oc-text-muted)]">
              {projection.streamItems.length} events
            </span>
          </div>
          {eventStart > 0 ? (
            <button
              type="button"
              className="w-full rounded-md border border-[var(--oc-border-muted)] bg-[var(--oc-surface-base)] px-3 py-2 text-xs text-[var(--oc-accent-primary)]"
              onClick={() => setVisibleEventCount((count) => count + 50)}
              data-testid="ui-v2-load-earlier-events"
            >
              Load {Math.min(50, eventStart)} earlier events
            </button>
          ) : null}
          {visibleEvents.map((item) => (
            <StreamEventRow
              key={item.id}
              item={item}
              onSelectRun={onSelectRun}
              onOpenTab={onOpenTab}
            />
          ))}
        </section>
      </div>
    </div>
  );
}

function SwimlaneCellButton({
  cell,
  selected,
  onSelect,
}: {
  cell?: SwimlaneCell;
  selected: boolean;
  onSelect: () => void;
}) {
  if (!cell) {
    return (
      <div className="min-h-16 rounded-md border border-dashed border-[var(--oc-border-muted)] bg-[var(--oc-surface-base)] p-2 text-xs text-[var(--oc-text-muted)]">
        Pending
      </div>
    );
  }

  return (
    <button
      type="button"
      className={cn(
        "min-h-16 w-full rounded-md border p-2 text-left text-xs transition",
        selected
          ? "border-[var(--oc-accent-primary)] bg-[var(--oc-accent-soft)]"
          : cell.status === "failed" || cell.status === "gated"
            ? statusClass[cell.status]
            : "border-[var(--oc-border-muted)] bg-[var(--oc-surface-base)] text-[var(--oc-text-primary)]",
      )}
      onClick={onSelect}
    >
      <div className="font-semibold">{cell.summary}</div>
      {cell.chips?.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {cell.chips.map((chip, index) => (
            <span
              key={`${chip}-${index}`}
              className="rounded-full bg-[var(--oc-surface-raised)] px-1.5 py-0.5 text-[10px]"
            >
              {chip}
            </span>
          ))}
        </div>
      ) : null}
    </button>
  );
}

function SelectedRunDetail({
  run,
  onOpenTab,
}: {
  run?: AgentRun;
  onOpenTab: (tab: WorkspaceTabId) => void;
}) {
  if (!run) {
    return null;
  }

  return (
    <aside
      className="border-t border-[var(--oc-border-muted)] bg-[var(--oc-surface-base)] p-4"
      data-testid="ui-v2-run-detail"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase text-[var(--oc-text-muted)]">
            Selected run
          </div>
          <h2 className="mt-1 text-sm font-semibold text-[var(--oc-text-primary)]">
            {run.agentName} / {run.currentStep}
          </h2>
          <p className="mt-1 text-xs text-[var(--oc-text-muted)]">
            {run.id} / {run.groupLabel}
          </p>
        </div>
        <StatusPill status={run.status} />
      </div>
      <p className="mt-3 text-sm text-[var(--oc-text-primary)]">{run.summary}</p>
      {run.risk ? (
        <div className="mt-3 rounded-md border border-[var(--oc-status-warning)]/45 bg-[var(--oc-status-warning)]/10 px-3 py-2 text-xs text-[var(--oc-text-primary)]">
          {run.risk}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md border border-[var(--oc-border-muted)] px-3 py-1.5 text-xs"
          onClick={() => onOpenTab("Terminal")}
        >
          Open tools
        </button>
        <button
          type="button"
          className="rounded-md border border-[var(--oc-border-muted)] px-3 py-1.5 text-xs"
          onClick={() => onOpenTab("Files")}
        >
          Open diffs
        </button>
        <button
          type="button"
          className="rounded-md border border-[var(--oc-border-muted)] px-3 py-1.5 text-xs"
          onClick={() => onOpenTab("Tests")}
        >
          Open tests
        </button>
      </div>
    </aside>
  );
}

function SwimlaneModeView({
  projection,
  selectedRunId,
  onSelectRun,
  onOpenTab,
  initialScrollTop,
  onScrollPositionChange,
}: {
  projection: UiV2Projection;
  selectedRunId: string;
  onSelectRun: (id: string) => void;
  onOpenTab: (tab: WorkspaceTabId) => void;
  initialScrollTop: number;
  onScrollPositionChange: (scrollTop: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedRun = projection.runs.find((run) => run.id === selectedRunId);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = initialScrollTop;
  }, [initialScrollTop]);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="ui-v2-swimlane">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto p-4"
        onScroll={(event) => onScrollPositionChange(event.currentTarget.scrollTop)}
        data-testid="ui-v2-swimlane-scroll"
      >
        <div className="min-w-[660px] rounded-lg border border-[var(--oc-border-muted)] bg-[var(--oc-surface-raised)]">
          <div className="grid grid-cols-[126px_repeat(4,minmax(100px,1fr))_90px] border-b border-[var(--oc-border-muted)] text-xs font-semibold uppercase text-[var(--oc-text-muted)]">
            <div className="p-3">Agent</div>
            {STEPS.map((step) => (
              <div key={step} className="border-l border-[var(--oc-border-muted)] p-3">
                {step}
              </div>
            ))}
            <div className="border-l border-[var(--oc-border-muted)] p-3">Status</div>
          </div>
          {projection.swimlaneRows.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-[126px_repeat(4,minmax(100px,1fr))_90px] border-b border-[var(--oc-border-muted)] last:border-b-0"
            >
              <div className="p-3">
                <div className="font-semibold text-[var(--oc-text-primary)]">{row.agentName}</div>
                <div className="text-xs text-[var(--oc-text-muted)]">{row.role}</div>
              </div>
              {STEPS.map((step) => {
                const cell = row.cells.find((candidate) => candidate.step === step);
                return (
                  <div
                    key={`${row.id}-${step}`}
                    className="border-l border-[var(--oc-border-muted)] p-2"
                  >
                    <SwimlaneCellButton
                      cell={cell}
                      selected={cell?.runId === selectedRunId}
                      onSelect={() => {
                        if (cell?.runId) onSelectRun(cell.runId);
                      }}
                    />
                  </div>
                );
              })}
              <div className="border-l border-[var(--oc-border-muted)] p-3">
                <StatusPill status={row.status} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <SelectedRunDetail run={selectedRun} onOpenTab={onOpenTab} />
    </div>
  );
}

function ComposerBar({
  projection,
  onSubmit,
}: {
  projection: UiV2Projection;
  onSubmit?: UiV2Actions["onComposerSubmit"];
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const composer = projection.composer;
  const gated = composer.mode === "gate_decision";
  const canSubmit = !composer.disabled && !composer.readOnly && !gated && text.trim().length > 0;

  async function submit() {
    if (!canSubmit || !onSubmit) return;
    setPending(true);
    try {
      await onSubmit(composer.mode, text.trim());
      setText("");
    } finally {
      setPending(false);
    }
  }

  return (
    <footer className="border-t border-[var(--oc-border-muted)] bg-[var(--oc-surface-base)] p-3">
      <div className="mb-2 flex items-center gap-2 text-xs text-[var(--oc-text-muted)]">
        <CircleDot className="size-3 text-[var(--oc-accent-primary)]" />
        {composer.reason}
      </div>
      {!composer.readOnly && !gated ? (
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-md border border-[var(--oc-border-muted)] bg-[var(--oc-surface-base)] px-3 py-2 text-sm outline-none focus:border-[var(--oc-accent-primary)]"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={
              composer.mode === "deployment_url"
                ? "Paste deployment URL"
                : composer.mode === "change_request"
                  ? "Describe the requirement change"
                  : composer.mode === "question_round"
                    ? "Answer the current requirement questions"
                    : "Tell Orchestrator what to build"
            }
            disabled={composer.disabled || pending}
          />
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md bg-[var(--oc-accent-primary)] px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void submit()}
            disabled={!canSubmit || !onSubmit || pending}
          >
            <Send className="size-4" />
            {composer.mode === "change_request" ? "Submit change" : "Send"}
          </button>
        </div>
      ) : null}
    </footer>
  );
}

function WorkspacePanel({
  projection,
  activeTab,
  onTabChange,
  selectedRun,
  renderWorkspaceTab,
}: {
  projection: UiV2Projection;
  activeTab: WorkspaceTabId;
  onTabChange: (tab: WorkspaceTabId) => void;
  selectedRun?: AgentRun;
  renderWorkspaceTab?: (tab: WorkspaceTabId) => ReactNode;
}) {
  return (
    <section
      className="flex h-full min-w-0 flex-col rounded-lg border border-[var(--oc-border-muted)] bg-[var(--oc-surface-base)]"
      data-testid="ui-v2-workspace"
    >
      <header className="flex items-start justify-between gap-4 border-b border-[var(--oc-border-muted)] p-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[var(--oc-text-primary)]">
            Project Workspace
          </h2>
          <p className="truncate text-xs text-[var(--oc-text-muted)]">{projection.project.slug}</p>
          {selectedRun ? (
            <p className="mt-1 text-xs text-[var(--oc-accent-primary)]">
              Linked from {selectedRun.agentName} / {selectedRun.currentStep}
            </p>
          ) : null}
        </div>
        <div className="grid grid-cols-5 gap-1 rounded-md border border-[var(--oc-border-muted)] bg-[var(--oc-surface-raised)] p-1">
          {WORKSPACE_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              className={cn(
                "h-8 rounded px-2 text-xs font-medium",
                activeTab === tab
                  ? "bg-[var(--oc-accent-soft)] text-[var(--oc-accent-primary)]"
                  : "text-[var(--oc-text-muted)]",
              )}
              onClick={() => onTabChange(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {renderWorkspaceTab ? (
          renderWorkspaceTab(activeTab)
        ) : (
          <>
            {activeTab === "Files" ? <FilesWorkspace projection={projection} /> : null}
            {activeTab === "Preview" ? <PreviewWorkspace projection={projection} /> : null}
            {activeTab === "Terminal" ? <TerminalWorkspace projection={projection} /> : null}
            {activeTab === "Tests" ? <TestsWorkspace projection={projection} /> : null}
            {activeTab === "Report" ? <ReportWorkspace projection={projection} /> : null}
          </>
        )}
      </div>
    </section>
  );
}

function FilesWorkspace({ projection }: { projection: UiV2Projection }) {
  if (projection.files.length === 0) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-[var(--oc-text-muted)]">
        No file or artifact events yet.
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-[560px] grid-cols-1 gap-4 xl:grid-cols-[240px_1fr]">
      <aside className="border-b border-[var(--oc-border-muted)] pb-4 xl:border-b-0 xl:border-r xl:pb-0 xl:pr-4">
        <div className="text-xs font-semibold uppercase text-[var(--oc-text-muted)]">
          Changed files
        </div>
        <ul className="mt-3 space-y-2">
          {projection.files.map((file, index) => (
            <li
              key={`${file.path}-${index}`}
              className="rounded-md px-2 py-1 text-sm hover:bg-[var(--oc-accent-soft)]"
            >
              <div className="truncate font-mono text-xs text-[var(--oc-text-primary)]">
                {file.path}
              </div>
              <div className="text-xs text-[var(--oc-text-muted)]">{file.status}</div>
            </li>
          ))}
        </ul>
      </aside>
      {projection.source === "fixture" ? (
        <section>
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <FileCode2 className="size-4 text-[var(--oc-accent-primary)]" />
            apps/generated/tasks/page.tsx
          </div>
          <pre className="overflow-auto rounded-lg bg-[var(--oc-text-primary)] p-4 font-mono text-xs leading-6 text-[var(--oc-surface-base)]">
            {`+ export function TaskBoard() {
+   return <Board columns={columns} onMoveTask={moveTask} />
+ }

+ test("moves a task from todo to review", async () => {
+   await page.getByRole("button", { name: "Move to review" }).click()
+ })`}
          </pre>
        </section>
      ) : (
        <section className="rounded-md border border-[var(--oc-border-muted)] bg-[var(--oc-surface-raised)] p-4 text-sm text-[var(--oc-text-muted)]">
          Select a file event to load its content from the project Files API.
        </section>
      )}
    </div>
  );
}

function PreviewWorkspace({ projection }: { projection: UiV2Projection }) {
  if (projection.source === "live" && !projection.previewUrl) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-[var(--oc-text-muted)]">
        Preview is not available for the current workflow state.
      </div>
    );
  }

  if (projection.source === "live") {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-[var(--oc-border-muted)] p-4">
          <div className="flex items-center gap-2 text-xs text-[var(--oc-text-muted)]">
            <MonitorPlay className="size-4" />
            Preview URL
          </div>
          <a
            className="mt-3 block break-all text-sm font-medium text-[var(--oc-accent-primary)] underline"
            href={projection.previewUrl}
            target="_blank"
            rel="noreferrer"
          >
            {projection.previewUrl}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[var(--oc-border-muted)] p-3">
        <div className="flex items-center gap-2 text-xs text-[var(--oc-text-muted)]">
          <MonitorPlay className="size-4" />
          {projection.previewUrl ?? "Preview URL pending"}
        </div>
        <div className="mt-4 grid min-h-80 grid-cols-1 gap-4 rounded-md bg-[var(--oc-surface-raised)] p-6 md:grid-cols-3">
          {["Todo", "In Progress", "Review"].map((column) => (
            <div
              key={column}
              className="rounded-md border border-[var(--oc-border-muted)] bg-[var(--oc-surface-base)] p-3"
            >
              <div className="font-semibold">{column}</div>
              <div className="mt-4 space-y-3">
                <div className="rounded-md border border-[var(--oc-border-muted)] p-3 text-sm">
                  Login form
                </div>
                <div className="rounded-md border border-[var(--oc-border-muted)] p-3 text-sm">
                  Task status flow
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <StatusPill status="completed" label="reachable" />
        <StatusPill status="completed" label="Playwright ready" />
        <StatusPill status="waiting" label="0 console errors" />
      </div>
    </div>
  );
}

function TerminalWorkspace({ projection }: { projection: UiV2Projection }) {
  if (projection.source === "live") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Terminal className="size-4 text-[var(--oc-accent-primary)]" />
          Governed terminal events
        </div>
        {projection.terminalItems.length ? (
          projection.terminalItems.map((item, index) => (
            <section
              key={`${item.title}-${index}`}
              className="rounded-md border border-[var(--oc-border-muted)] bg-[var(--oc-surface-raised)] p-3"
            >
              <div className="font-mono text-xs font-semibold text-[var(--oc-text-primary)]">
                {item.title}
              </div>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-xs text-[var(--oc-text-muted)]">
                {item.summary}
              </pre>
            </section>
          ))
        ) : (
          <div className="flex min-h-64 items-center justify-center text-sm text-[var(--oc-text-muted)]">
            No tool call events yet.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Terminal className="size-4 text-[var(--oc-accent-primary)]" />
        Governed terminal
      </div>
      <pre className="min-h-96 overflow-auto rounded-lg bg-[var(--oc-text-primary)] p-4 font-mono text-xs leading-6 text-[var(--oc-surface-base)]">
        {`$ npm install @dnd-kit/core
risk: high external download
status: waiting for dangerous_operation gate

permission.ask -> routed through OneCompany risk policy
redaction: enabled
log chunk: artifacts/logs/tool-call-482.txt`}
      </pre>
    </div>
  );
}

function TestsWorkspace({ projection }: { projection: UiV2Projection }) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold">Final acceptance suite</h3>
        <p className="text-xs text-[var(--oc-text-muted)]">
          Per-slice checks remain separate from final Testing phase.
        </p>
      </div>
      {projection.tests.length === 0 ? (
        <div className="flex min-h-48 items-center justify-center text-sm text-[var(--oc-text-muted)]">
          No test result events yet.
        </div>
      ) : (
        projection.tests.map((test, index) => (
          <div
            key={`${test.name}-${index}`}
            className="flex items-center justify-between rounded-lg border border-[var(--oc-border-muted)] bg-[var(--oc-surface-raised)] px-4 py-3"
          >
            <div>
              <div className="font-semibold text-[var(--oc-text-primary)]">{test.name}</div>
              <div className="text-xs text-[var(--oc-text-muted)]">{test.detail}</div>
            </div>
            <StatusPill
              status={
                test.status === "passed"
                  ? "completed"
                  : test.status === "failed"
                    ? "failed"
                    : "pending"
              }
              label={test.status}
            />
          </div>
        ))
      )}
      {projection.source === "fixture" ? (
        <pre className="mt-4 overflow-auto rounded-lg bg-[var(--oc-text-primary)] p-4 font-mono text-xs leading-6 text-[var(--oc-surface-base)]">
          {`trace: mobile-button-overflow.spec.ts
expect(locator("button[name=Create]")).toBeVisible()
Element overlaps with status footer at 390px width.
Suggested fix: reduce toolbar gap and wrap action label.`}
        </pre>
      ) : null}
    </div>
  );
}

function ReportWorkspace({ projection }: { projection: UiV2Projection }) {
  return (
    <div className="space-y-4">
      {projection.reportArtifacts.length ? (
        projection.reportArtifacts.map((section, index) => (
          <section
            key={`${section}-${index}`}
            className="rounded-lg border border-[var(--oc-border-muted)] bg-[var(--oc-surface-raised)] p-4"
          >
            <div className="font-semibold text-[var(--oc-text-primary)]">{section}</div>
            <p className="mt-1 text-sm text-[var(--oc-text-muted)]">Generated workflow artifact.</p>
          </section>
        ))
      ) : (
        <div className="flex min-h-64 items-center justify-center text-sm text-[var(--oc-text-muted)]">
          No delivery report has been generated yet.
        </div>
      )}
    </div>
  );
}

export function UiV2Shell({
  projection = uiV2Fixture,
  actions,
  renderWorkspaceTab,
}: {
  projection?: UiV2Projection;
  actions?: UiV2Actions;
  renderWorkspaceTab?: (tab: WorkspaceTabId) => ReactNode;
}) {
  const [mode, setMode] = useState<ConsoleMode>("stream");
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTabId>("Tests");
  const streamScrollTopRef = useRef(0);
  const swimlaneScrollTopRef = useRef(0);
  const preferredRunId =
    projection.runs.find(
      (run) => run.status === "gated" || run.status === "failed" || run.status === "running",
    )?.id ??
    projection.runs[0]?.id ??
    "";
  const [selectedRunId, setSelectedRunId] = useState(preferredRunId);

  useEffect(() => {
    if (!projection.runs.some((run) => run.id === selectedRunId)) {
      setSelectedRunId(preferredRunId);
    }
  }, [preferredRunId, projection.runs, selectedRunId]);
  const selectedRun = useMemo(
    () => projection.runs.find((run) => run.id === selectedRunId),
    [projection.runs, selectedRunId],
  );

  return (
    <main
      className="flex min-h-screen flex-col overflow-auto bg-[var(--oc-app-bg)] text-[var(--oc-text-primary)] lg:h-screen lg:overflow-hidden"
      data-testid="ui-v2-shell"
      style={{ fontFamily: "var(--font-geist-sans)" }}
    >
      <TopNavigation projection={projection} actions={actions} />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="flex min-h-[820px] min-w-0 flex-col border-b border-[var(--oc-border-muted)] bg-[var(--oc-surface-raised)] lg:min-h-0 lg:basis-[48%] lg:border-b-0 lg:border-r">
          <OrchestrationStrip projection={projection} />
          <ModeSwitcher mode={mode} onModeChange={setMode} />
          {mode === "stream" ? (
            <StreamModeView
              projection={projection}
              runs={projection.runs}
              selectedRunId={selectedRunId}
              onSelectRun={setSelectedRunId}
              onOpenTab={setWorkspaceTab}
              onResolveGate={actions?.onResolveGate}
              initialScrollTop={streamScrollTopRef.current}
              onScrollPositionChange={(scrollTop) => {
                streamScrollTopRef.current = scrollTop;
              }}
            />
          ) : (
            <SwimlaneModeView
              projection={projection}
              selectedRunId={selectedRunId}
              onSelectRun={setSelectedRunId}
              onOpenTab={setWorkspaceTab}
              initialScrollTop={swimlaneScrollTopRef.current}
              onScrollPositionChange={(scrollTop) => {
                swimlaneScrollTopRef.current = scrollTop;
              }}
            />
          )}
          <ComposerBar projection={projection} onSubmit={actions?.onComposerSubmit} />
        </section>
        <section className="min-h-[720px] min-w-0 flex-1 p-3 lg:p-4">
          <WorkspacePanel
            projection={projection}
            activeTab={workspaceTab}
            onTabChange={setWorkspaceTab}
            selectedRun={selectedRun}
            renderWorkspaceTab={renderWorkspaceTab}
          />
        </section>
      </div>
    </main>
  );
}
