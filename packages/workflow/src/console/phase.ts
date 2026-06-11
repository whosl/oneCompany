import type { ConsolePhase, ProjectStatus } from "@oc/shared";

const DEVELOPMENT_STATUSES = new Set<ProjectStatus>([
  "Developing",
  "Change Review",
  "Testing",
  "Deploying",
  "Awaiting Acceptance",
  "Delivered",
]);

export function derivePhaseFromStatus(
  status: ProjectStatus,
  input: {
    completenessScore?: number;
    sliceIndex?: number;
    sliceTotal?: number;
    suitePassed?: number;
    suiteTotal?: number;
  } = {},
): ConsolePhase {
  if (status === "Draft Requirement" || status === "Asking Questions") {
    return {
      label: status,
      activeGroup: "Requirement Group",
      progressLabel:
        input.completenessScore !== undefined
          ? `Completeness ${input.completenessScore}`
          : undefined,
    };
  }

  if (status === "PRD Ready" || status === "Tech Plan Review") {
    return {
      label: status,
      activeGroup: status === "Tech Plan Review" ? "Architecture Group" : "Requirement Group",
      progressLabel: status === "PRD Ready" ? "PRD ready" : "Tech plan review",
    };
  }

  if (status === "Developing" || status === "Change Review") {
    // sliceIndex equals the passed-count when no slice is in flight, so the
    // 1-based display must clamp to the total ("Slice 4 / 3" otherwise).
    const sliceIndex = input.sliceIndex ?? 0;
    const sliceTotal = input.sliceTotal ?? 0;
    const current = Math.min(sliceIndex + 1, sliceTotal);
    return {
      label: status,
      activeGroup: "Development Group",
      progressLabel: sliceTotal > 0 ? `Slice ${current} / ${sliceTotal}` : undefined,
    };
  }

  if (status === "Testing") {
    const passed = input.suitePassed ?? 0;
    const total = input.suiteTotal ?? 0;
    return {
      label: status,
      activeGroup: "QA Group",
      progressLabel: total > 0 ? `Suites ${passed}/${total}` : undefined,
    };
  }

  if (status === "Deploying" || status === "Awaiting Acceptance") {
    return {
      label: status,
      activeGroup: "Delivery Group",
      progressLabel: status === "Deploying" ? "Deploying" : "Awaiting acceptance",
    };
  }

  if (status === "Paused") {
    return { label: "Paused", activeGroup: "Paused", progressLabel: "Paused" };
  }

  if (status === "Failed") {
    return { label: "Failed", activeGroup: "Failed", progressLabel: "Failed" };
  }

  if (status === "Delivered") {
    return { label: "Delivered", activeGroup: "Delivered", progressLabel: "Delivered" };
  }

  return { label: status, activeGroup: "Project", progressLabel: undefined };
}

export function isCompletenessLocked(status: ProjectStatus): boolean {
  return DEVELOPMENT_STATUSES.has(status);
}
