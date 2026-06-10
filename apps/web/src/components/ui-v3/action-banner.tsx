import { useState } from "react";
import { ArrowRight, Info } from "lucide-react";
import { UiButton } from "../ui-v2/primitives";
import type { UiV3ContextualAction, UiV3LifecycleState } from "./types";

export function ActionBanner({
  lifecycle,
  composerReason,
  actions,
  sliceProgress,
  disabled,
  onAction,
}: {
  lifecycle: UiV3LifecycleState;
  composerReason: string;
  actions: UiV3ContextualAction[];
  sliceProgress?: { current: number; total: number; sliceId?: string };
  disabled?: boolean;
  onAction?: (actionId: string) => Promise<void>;
}) {
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const primary = actions.find((action) => action.variant === "primary" && !action.disabled);

  async function runAction(actionId: string) {
    if (!onAction || disabled || pendingActionId) return;
    setError(null);
    setPendingActionId(actionId);
    try {
      await onAction(actionId);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "操作失败，请稍后重试");
    } finally {
      setPendingActionId(null);
    }
  }

  return (
    <section
      className="rounded-lg border border-[var(--v3-border)] bg-[var(--v3-surface)] px-4 py-3"
      data-testid="ui-v3-action-banner"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--v3-accent)]">
            <Info className="size-3.5" />
            下一步
          </div>
          <p className="mt-1 text-sm font-medium text-[var(--v3-text)]">{composerReason}</p>
          <p className="mt-0.5 text-xs text-[var(--v3-text-muted)]">
            当前阶段：{lifecycle.label}
            {sliceProgress
              ? ` · 切片 ${sliceProgress.current}/${sliceProgress.total}${sliceProgress.sliceId ? ` (${sliceProgress.sliceId})` : ""}`
              : ""}
          </p>
        </div>
        {primary && onAction ? (
          <UiButton
            type="button"
            variant="primary"
            size="sm"
            disabled={disabled || primary.disabled || pendingActionId !== null}
            title={primary.disabledReason}
            onClick={() => void runAction(primary.id)}
            className="shrink-0"
            data-testid={`ui-v3-action-${primary.id}`}
          >
            {pendingActionId === primary.id
              ? primary.id === "start-development"
                ? "启动中（约 1–2 分钟）…"
                : "处理中…"
              : primary.label}
            <ArrowRight className="size-3.5" />
          </UiButton>
        ) : null}
      </div>
      {error ? (
        <p className="mt-2 rounded-md border border-[var(--v3-danger)]/35 bg-[var(--v3-danger)]/8 px-3 py-2 text-sm text-[var(--v3-danger)]">
          {error}
        </p>
      ) : null}
      {actions.length > 1 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {actions
            .filter((action) => action.id !== primary?.id)
            .map((action) => (
              <UiButton
                key={action.id}
                variant={action.variant === "danger" ? "danger" : "secondary"}
                size="sm"
                disabled={disabled || action.disabled || pendingActionId !== null}
                title={action.disabledReason ?? action.description}
                onClick={() => void runAction(action.id)}
              >
                {pendingActionId === action.id ? "处理中…" : action.label}
              </UiButton>
            ))}
        </div>
      ) : null}
    </section>
  );
}
