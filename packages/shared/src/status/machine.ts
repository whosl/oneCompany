import {
  ProjectStatusSchema,
  STATUS_TRANSITIONS,
  type ProjectStatus,
} from "../schemas/project-status.js";

const TERMINAL_STATUSES = new Set<ProjectStatus>(["Delivered", "Failed"]);

export function isTerminal(status: ProjectStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function isActive(status: ProjectStatus): boolean {
  return !isTerminal(status) && status !== "Paused";
}

export type TransitionContext = {
  /** Required when leaving `Paused` to resume the prior active state. */
  pausedFrom?: ProjectStatus;
};

export function canTransition(
  from: ProjectStatus,
  to: ProjectStatus,
  ctx: TransitionContext = {},
): boolean {
  if (from === to) {
    return STATUS_TRANSITIONS[from].includes(to);
  }

  if (isTerminal(from)) {
    return false;
  }

  if (from === "Paused") {
    if (to === "Failed") {
      return true;
    }
    return ctx.pausedFrom !== undefined && to === ctx.pausedFrom;
  }

  if (to === "Paused" || to === "Failed") {
    return isActive(from);
  }

  return STATUS_TRANSITIONS[from].includes(to);
}

export function assertTransition(
  from: ProjectStatus,
  to: ProjectStatus,
  ctx: TransitionContext = {},
): void {
  if (!canTransition(from, to, ctx)) {
    throw new Error(`Illegal status transition: ${from} -> ${to}`);
  }
}

export function parseProjectStatus(value: string): ProjectStatus {
  return ProjectStatusSchema.parse(value);
}
