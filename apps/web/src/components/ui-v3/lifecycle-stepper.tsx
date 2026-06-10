import { Check } from "lucide-react";
import { LIFECYCLE_STEPS } from "./constants";
import type { UiV3LifecycleState } from "./types";

export function LifecycleStepper({
  lifecycle,
  projectStatus,
}: {
  lifecycle: UiV3LifecycleState;
  projectStatus: string;
}) {
  return (
    <nav
      className="flex min-w-0 items-center gap-1 overflow-x-auto py-1"
      aria-label="项目生命周期"
      data-testid="ui-v3-lifecycle"
    >
      {LIFECYCLE_STEPS.map((step, index) => {
        const active = lifecycle.stepIndex === index;
        const done = lifecycle.stepIndex > index;
        const isCurrentStatus = step.statuses.includes(projectStatus);
        return (
          <div key={step.id} className="flex min-w-0 items-center gap-1">
            <div
              className={[
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap",
                active || isCurrentStatus
                  ? "border-[var(--v3-accent)] bg-[var(--v3-accent-soft)] text-[var(--v3-accent)]"
                  : done
                    ? "border-[var(--v3-success)]/30 bg-[var(--v3-success)]/8 text-[var(--v3-success)]"
                    : "border-[var(--v3-border)] bg-[var(--v3-surface)] text-[var(--v3-text-muted)]",
              ].join(" ")}
            >
              {done ? <Check className="size-3" /> : <span className="size-1.5 rounded-full bg-current" />}
              {step.label}
            </div>
            {index < LIFECYCLE_STEPS.length - 1 ? (
              <span className="text-[var(--v3-border-strong)]">›</span>
            ) : null}
          </div>
        );
      })}
      {projectStatus === "Failed" ? (
        <span className="ml-2 rounded-full border border-[var(--v3-danger)]/40 bg-[var(--v3-danger)]/10 px-2 py-1 text-xs font-medium text-[var(--v3-danger)]">
          失败
        </span>
      ) : null}
    </nav>
  );
}
