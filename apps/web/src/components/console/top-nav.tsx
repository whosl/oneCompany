"use client";

import type { ConsoleProjection } from "@/lib/projection/types";
import { ProjectSwitcher } from "./project-switcher";

export function TopNav({
  projection,
  projectId,
  dropdownOpen,
  onToggleDropdown,
  onOpenHub,
  onOpenSettings,
  onPauseResume,
  onDeploy,
  deployPending = false,
}: {
  projection: ConsoleProjection;
  projectId: string;
  dropdownOpen: boolean;
  onToggleDropdown: () => void;
  onOpenHub: () => void;
  onOpenSettings: () => void;
  onPauseResume: () => void;
  onDeploy?: (projectId: string) => void;
  deployPending?: boolean;
}) {
  const { snapshot } = projection;
  const isPaused = snapshot.project.status === "Paused";

  return (
    <header
      className="flex h-16 items-center justify-between border-b border-[var(--oc-border-muted)] px-4"
      data-testid="top-nav"
    >
      <div className="flex items-center gap-3">
        <ProjectSwitcher
          projection={projection}
          dropdownOpen={dropdownOpen}
          onToggleDropdown={onToggleDropdown}
          onOpenHub={onOpenHub}
        />
        <span className="rounded-full bg-[var(--oc-surface-raised)] px-2 py-1 text-xs">
          {snapshot.project.status}
        </span>
        <span className="rounded-full bg-[var(--oc-accent-soft)] px-2 py-1 text-xs">
          {snapshot.phase.label}
        </span>
        <span className="rounded-full bg-[var(--oc-surface-raised)] px-2 py-1 text-xs">
          {snapshot.phase.activeGroup}
        </span>
        {snapshot.phase.progressLabel ? (
          <span className="rounded-full bg-[var(--oc-surface-raised)] px-2 py-1 text-xs">
            {snapshot.phase.progressLabel}
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-md border px-3 py-1 text-xs"
          title="Run final tests and request deployment"
          disabled={deployPending || snapshot.project.status !== "Testing"}
          onClick={() => onDeploy?.(projectId)}
          data-testid="top-nav-deploy"
        >
          {deployPending ? "Deploying…" : "Deploy"}
        </button>
        <button
          type="button"
          className="rounded-md border px-3 py-1 text-xs"
          onClick={onPauseResume}
        >
          {isPaused ? "Resume" : "Pause"}
        </button>
        <button
          type="button"
          className="rounded-md border px-3 py-1 text-xs"
          onClick={onOpenSettings}
          aria-label="Open settings"
        >
          Avatar
        </button>
      </div>
    </header>
  );
}
