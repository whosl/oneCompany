import { Pause, Play, Rocket, Settings2 } from "lucide-react";
import { UiButton } from "../ui-v2/primitives";
import { LifecycleStepper } from "./lifecycle-stepper";
import type { UiV3LifecycleState } from "./types";

export function TopBar({
  projectName,
  projectStatus,
  lifecycle,
  activeGroup,
  progressLabel,
  isPaused,
  canDeploy,
  deployDisabledReason,
  onProjectSwitch,
  onPauseResume,
  onDeploy,
  onSettings,
}: {
  projectName: string;
  projectStatus: string;
  lifecycle: UiV3LifecycleState;
  activeGroup?: string;
  progressLabel?: string;
  isPaused: boolean;
  canDeploy: boolean;
  deployDisabledReason?: string;
  onProjectSwitch?: () => void;
  onPauseResume?: () => void;
  onDeploy?: () => void;
  onSettings?: () => void;
}) {
  return (
    <header
      className="border-b border-[var(--v3-border)] bg-[var(--v3-surface)]"
      data-testid="ui-v3-top-bar"
    >
      {isPaused ? (
        <div className="border-b border-[var(--v3-warning)]/40 bg-[var(--v3-warning)]/10 px-4 py-2 text-center text-sm text-[var(--v3-warning)]">
          项目已暂停 · 恢复前所有 gate 与变更操作不可用
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--v3-accent)]">
              OneCompany
            </p>
            <button
              type="button"
              className="text-left text-base font-semibold hover:text-[var(--v3-accent)]"
              onClick={onProjectSwitch}
            >
              {projectName}
            </button>
          </div>
          <span className="rounded-full border border-[var(--v3-border)] bg-[var(--v3-surface-muted)] px-2.5 py-1 text-xs font-medium">
            {projectStatus}
          </span>
          {activeGroup ? (
            <span className="hidden text-xs text-[var(--v3-text-muted)] md:inline">
              {activeGroup}
              {progressLabel ? ` · ${progressLabel}` : ""}
            </span>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <LifecycleStepper lifecycle={lifecycle} projectStatus={projectStatus} />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <UiButton
            variant="secondary"
            size="sm"
            onClick={onPauseResume}
            disabled={projectStatus === "Delivered" || projectStatus === "Failed"}
          >
            {isPaused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
            {isPaused ? "恢复" : "暂停"}
          </UiButton>
          <UiButton
            variant="primary"
            size="sm"
            onClick={onDeploy}
            disabled={!canDeploy}
            title={deployDisabledReason}
          >
            <Rocket className="size-3.5" />
            部署
          </UiButton>
          <UiButton variant="ghost" size="icon-sm" onClick={onSettings} aria-label="设置">
            <Settings2 className="size-4" />
          </UiButton>
        </div>
      </div>
    </header>
  );
}
