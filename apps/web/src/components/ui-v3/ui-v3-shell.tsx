"use client";

import { useMemo, useState } from "react";
import { LayoutGrid, List, Users } from "lucide-react";
import { UiTabs } from "../ui-v2/primitives";
import { ActionBanner } from "./action-banner";
import { AgentRoster } from "./agent-roster";
import { ComposerPanel } from "./composer";
import { GatePanel } from "./gate-panel";
import { SwimlaneMatrix } from "./swimlane";
import { Timeline } from "./timeline";
import { TopBar } from "./top-bar";
import type { UiV3Actions, UiV3ConsoleMode, UiV3Projection } from "./types";
import type { WorkspaceTabId } from "../ui-v2/types";

function buildStatusMarkers(projection: UiV3Projection) {
  return projection.rawProjection.events.flatMap((event) =>
    event.payload.type === "project.status_changed"
      ? [{ seq: event.seq, status: event.payload.status }]
      : [],
  );
}

export function UiV3Shell({
  projection,
  actions,
  renderWorkspaceTab,
}: {
  projection: UiV3Projection;
  actions: UiV3Actions;
  renderWorkspaceTab: (tab: WorkspaceTabId) => React.ReactNode;
}) {
  const [consoleMode, setConsoleMode] = useState<UiV3ConsoleMode>("timeline");
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTabId>("Files");
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>();

  const statusMarkers = useMemo(() => buildStatusMarkers(projection), [projection]);
  const isPaused = projection.base.project.status === "Paused";
  const canDeploy = projection.base.project.status === "Testing";
  const deployDisabledReason =
    projection.base.project.status !== "Testing" ? "仅在 Testing 阶段可触发部署" : undefined;
  const interactionDisabled = isPaused;
  const composerInputDisabled =
    isPaused || projection.base.composer.disabled || projection.base.composer.readOnly;

  return (
    <div className="ui-v3-root flex h-screen min-h-0 flex-col" data-testid="ui-v3-shell">
      <TopBar
        projectName={projection.base.project.name}
        projectStatus={projection.base.project.status}
        lifecycle={projection.lifecycle}
        activeGroup={projection.base.project.activeGroup}
        progressLabel={projection.base.project.progress}
        isPaused={isPaused}
        canDeploy={canDeploy}
        deployDisabledReason={deployDisabledReason}
        onProjectSwitch={actions.onOpenProjectHub}
        onPauseResume={() => void actions.onPauseResume()}
        onDeploy={() => void actions.onDeploy()}
        onSettings={actions.onOpenSettings}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_minmax(320px,38%)]">
        <AgentRoster
          agents={projection.agentStates}
          selectedAgentId={selectedAgentId}
          onSelectAgent={(id) => {
            setSelectedAgentId((current) => (current === id ? undefined : id));
            setConsoleMode("timeline");
          }}
        />

        <div className="flex min-h-0 min-w-0 flex-col border-r border-[var(--v3-border)]">
          <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
            <ActionBanner
              lifecycle={projection.lifecycle}
              composerReason={projection.base.composer.reason}
              actions={projection.contextualActions}
              sliceProgress={projection.sliceProgress}
              disabled={interactionDisabled}
              onAction={actions.onContextualAction}
            />

            <GatePanel
              gates={projection.openGates}
              disabled={interactionDisabled}
              onResolve={actions.onResolveGate}
            />

            {(projection.base.requirementSnapshot.raw ||
              projection.base.requirementSnapshot.normalized) && (
              <section className="rounded-lg border border-[var(--v3-border)] bg-[var(--v3-surface-subtle)] p-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--v3-text-muted)]">
                  需求摘要
                </h2>
                <p className="mt-1 text-sm font-medium">{projection.base.requirementSnapshot.normalized}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[var(--v3-text-muted)]">
                  <span>完成度 {projection.base.requirementSnapshot.score}</span>
                  {projection.base.requirementSnapshot.facts.map((fact) => (
                    <span
                      key={fact}
                      className="rounded-full border border-[var(--v3-success)]/30 bg-[var(--v3-success)]/8 px-2 py-0.5 text-[var(--v3-success)]"
                    >
                      {fact}
                    </span>
                  ))}
                </div>
              </section>
            )}

            <div className="flex items-center gap-1 rounded-lg border border-[var(--v3-border)] bg-[var(--v3-surface-muted)] p-1">
              {(
                [
                  { id: "timeline" as const, label: "时间线", icon: List },
                  { id: "swimlane" as const, label: "泳道", icon: LayoutGrid },
                  { id: "agents" as const, label: "Run 详情", icon: Users },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className={[
                    "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium",
                    consoleMode === mode.id
                      ? "bg-[var(--v3-surface)] text-[var(--v3-accent)] shadow-sm"
                      : "text-[var(--v3-text-muted)] hover:text-[var(--v3-text)]",
                  ].join(" ")}
                  onClick={() => setConsoleMode(mode.id)}
                >
                  <mode.icon className="size-3.5" />
                  {mode.label}
                </button>
              ))}
            </div>

            {consoleMode === "timeline" ? (
              <Timeline
                items={projection.base.streamItems}
                runs={projection.base.runs}
                selectedAgentId={selectedAgentId}
                statusMarkers={statusMarkers}
              />
            ) : null}

            {consoleMode === "swimlane" ? (
              <SwimlaneMatrix rows={projection.base.swimlaneRows} />
            ) : null}

            {consoleMode === "agents" ? (
              <section className="space-y-3">
                {projection.base.runs
                  .filter((run) =>
                    selectedAgentId
                      ? run.agentId.split("@")[0] === selectedAgentId
                      : true,
                  )
                  .map((run) => (
                    <article
                      key={run.id}
                      className="rounded-lg border border-[var(--v3-border)] bg-[var(--v3-surface)] p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold">{run.agentName}</h3>
                        <span className="text-xs text-[var(--v3-text-muted)]">{run.status}</span>
                      </div>
                      <p className="mt-1 text-xs text-[var(--v3-text-muted)]">{run.summary}</p>
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {run.steps.map((step) => (
                          <div
                            key={step.name}
                            className="rounded-md border border-[var(--v3-border)] bg-[var(--v3-surface-subtle)] p-2"
                          >
                            <div className="text-[10px] font-semibold uppercase text-[var(--v3-text-muted)]">
                              {step.name}
                            </div>
                            <div className="mt-1 line-clamp-3 text-[11px]">{step.summary}</div>
                            <div className="mt-1 text-[10px] text-[var(--v3-accent)]">{step.status}</div>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
              </section>
            ) : null}
          </div>

          <ComposerPanel
            composer={projection.base.composer}
            pendingQuestions={projection.pendingQuestions}
            disabled={composerInputDisabled}
            onSubmit={(mode, text, answers) => actions.onComposerSubmit(mode, text, answers)}
          />
        </div>

        <aside className="flex min-h-0 min-w-0 flex-col bg-[var(--v3-surface)]">
          <div className="border-b border-[var(--v3-border)] px-4 py-3">
            <h2 className="text-sm font-semibold">项目工作区</h2>
            <p className="text-xs text-[var(--v3-text-muted)]">{projection.base.project.slug}</p>
          </div>
          <UiTabs
            tabs={["Files", "Preview", "Terminal", "Tests", "Report"]}
            activeTab={workspaceTab}
            onTabChange={setWorkspaceTab}
            ariaLabel="项目工作区"
            className="px-4"
          />
          <div className="min-h-0 flex-1 overflow-auto p-4">{renderWorkspaceTab(workspaceTab)}</div>
        </aside>
      </div>
    </div>
  );
}
