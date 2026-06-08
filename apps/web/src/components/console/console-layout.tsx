"use client";

import { useState } from "react";
import { RightPanel } from "../right-panel/right-panel";
import { useConsoleProjection } from "@/lib/projection/use-console-projection";
import { consoleApi } from "@/lib/api";
import { TopNav } from "./top-nav";
import { SettingsModal } from "./settings-modal";
import { ProjectHub } from "./project-hub";
import { StreamRenderer } from "./stream-renderer";
import { SwimlaneRenderer } from "./swimlane-renderer";
import { Composer } from "./composer";

export function ConsoleLayout({ projectId }: { projectId: string }) {
  const { projection, status, refresh } = useConsoleProjection(projectId);
  const [leftMode, setLeftMode] = useState<"stream" | "swimlane">("stream");
  const [leftWidth, setLeftWidth] = useState(44);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hubOpen, setHubOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  if (status === "loading" || !projection) {
    return <main className="p-6">Loading console…</main>;
  }

  if (status === "error") {
    return <main className="p-6">Failed to load console.</main>;
  }

  return (
    <div className="flex h-screen flex-col bg-[var(--oc-app-bg)]" data-testid="console-layout">
      <TopNav
        projection={projection}
        dropdownOpen={dropdownOpen && !hubOpen}
        onToggleDropdown={() => setDropdownOpen((open) => !open)}
        onOpenHub={() => {
          setHubOpen(true);
          setDropdownOpen(false);
        }}
        onOpenSettings={() => setSettingsOpen(true)}
        onPauseResume={() => {
          const paused = projection.snapshot.project.status === "Paused";
          void (paused
            ? consoleApi.resumeProject(projectId)
            : consoleApi.pauseProject(projectId)
          ).then(() => refresh());
        }}
      />

      <div className="flex min-h-0 flex-1">
        <section
          className="flex min-w-0 flex-col border-r border-[var(--oc-border-muted)]"
          style={{ width: `${leftWidth}%` }}
          data-testid="left-panel"
        >
          <div className="flex gap-2 border-b border-[var(--oc-border-muted)] p-2">
            <button
              type="button"
              className={leftMode === "stream" ? "oc-tab px-3 py-1 text-sm" : "px-3 py-1 text-sm"}
              data-active={leftMode === "stream" ? "true" : "false"}
              onClick={() => setLeftMode("stream")}
            >
              Stream
            </button>
            <button
              type="button"
              className={leftMode === "swimlane" ? "oc-tab px-3 py-1 text-sm" : "px-3 py-1 text-sm"}
              data-active={leftMode === "swimlane" ? "true" : "false"}
              onClick={() => setLeftMode("swimlane")}
            >
              Swimlane
            </button>
          </div>

          <div className="min-h-0 flex-1">
            {leftMode === "stream" ? (
              <StreamRenderer
                projection={projection}
                onNavigateTab={() => undefined}
                onGateResolved={() => void refresh()}
              />
            ) : (
              <SwimlaneRenderer projection={projection} />
            )}
          </div>

          {leftMode === "stream" ? (
            <Composer projectId={projectId} projection={projection} onSubmitted={() => void refresh()} />
          ) : null}
        </section>

        <div
          className="w-1 cursor-col-resize bg-[var(--oc-border-muted)]"
          onMouseDown={(event) => {
            const startX = event.clientX;
            const startWidth = leftWidth;
            function onMove(moveEvent: MouseEvent) {
              const delta = moveEvent.clientX - startX;
              const container = (event.target as HTMLElement).parentElement;
              if (!container) return;
              const ratio = ((startWidth / 100) * container.clientWidth + delta) / container.clientWidth;
              setLeftWidth(Math.min(60, Math.max(30, ratio * 100)));
            }
            function onUp() {
              window.removeEventListener("mousemove", onMove);
              window.removeEventListener("mouseup", onUp);
            }
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
          }}
        />

        <section className="min-w-0 flex-1 p-3" style={{ width: `${100 - leftWidth}%` }} data-testid="right-panel-slot">
          <RightPanel projectId={projectId} />
        </section>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ProjectHub
        open={hubOpen}
        currentProjectId={projectId}
        onClose={() => setHubOpen(false)}
      />
    </div>
  );
}
