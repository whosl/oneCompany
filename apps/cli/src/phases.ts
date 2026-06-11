import type { ConsoleSnapshot } from "./types.js";

export type GlobalStatus =
  | "IDLE"
  | "INITIALIZING"
  | "CLARIFYING"
  | "PLANNING"
  | "BUILDING"
  | "VALIDATING"
  | "EXPORTING"
  | "COMPLETED"
  | "FAILED"
  | "BLOCKED";

export type PhaseId =
  | "INIT"
  | "REQUIREMENT_ANALYSIS"
  | "CLARIFICATION"
  | "PLANNING"
  | "TOOL_PREPARATION"
  | "APP_GENERATION"
  | "CODE_CHECK"
  | "VALIDATION"
  | "DOCUMENTATION"
  | "EXPORT"
  | "DONE"
  | "ERROR";

export type PhaseStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED" | "SKIPPED";

export type PhaseRecord = {
  id: PhaseId;
  label: string;
  status: PhaseStatus;
  startedAt?: string;
  endedAt?: string;
};

const PHASE_CATALOG: Array<{ id: PhaseId; label: string }> = [
  { id: "INIT", label: "Init" },
  { id: "REQUIREMENT_ANALYSIS", label: "Requirement Analysis" },
  { id: "CLARIFICATION", label: "Clarification" },
  { id: "PLANNING", label: "Planning" },
  { id: "TOOL_PREPARATION", label: "Tool Preparation" },
  { id: "APP_GENERATION", label: "App Generation" },
  { id: "CODE_CHECK", label: "Code Check" },
  { id: "VALIDATION", label: "Validation" },
  { id: "DOCUMENTATION", label: "Documentation" },
  { id: "EXPORT", label: "Export" },
  { id: "DONE", label: "Done" },
];

export function createPhaseTimeline(): PhaseRecord[] {
  return PHASE_CATALOG.map((phase) => ({
    id: phase.id,
    label: phase.label,
    status: "PENDING",
  }));
}

const STATUS_TO_GLOBAL: Record<string, GlobalStatus> = {
  "Draft Requirement": "INITIALIZING",
  "Asking Questions": "CLARIFYING",
  "PRD Ready": "PLANNING",
  "Tech Plan Review": "PLANNING",
  Developing: "BUILDING",
  "Change Review": "BUILDING",
  Testing: "VALIDATING",
  Deploying: "EXPORTING",
  "Awaiting Acceptance": "EXPORTING",
  Delivered: "COMPLETED",
  Failed: "FAILED",
  Paused: "BLOCKED",
};

const STATUS_TO_PHASE: Record<string, PhaseId> = {
  "Draft Requirement": "REQUIREMENT_ANALYSIS",
  "Asking Questions": "CLARIFICATION",
  "PRD Ready": "PLANNING",
  "Tech Plan Review": "PLANNING",
  Developing: "APP_GENERATION",
  "Change Review": "CODE_CHECK",
  Testing: "VALIDATION",
  Deploying: "EXPORT",
  "Awaiting Acceptance": "EXPORT",
  Delivered: "DONE",
  Failed: "ERROR",
  Paused: "PLANNING",
};

export function deriveGlobalStatus(
  projectStatus?: string,
  hasOpenGates?: boolean,
  mode?: string,
): GlobalStatus {
  if (mode === "error") return "FAILED";
  if (mode === "done") return "COMPLETED";
  if (hasOpenGates) return "BLOCKED";
  if (!projectStatus) return "IDLE";
  return STATUS_TO_GLOBAL[projectStatus] ?? "INITIALIZING";
}

export function deriveCurrentPhase(projectStatus?: string): PhaseId {
  if (!projectStatus) return "INIT";
  return STATUS_TO_PHASE[projectStatus] ?? "REQUIREMENT_ANALYSIS";
}

export function syncPhasesFromStatus(phases: PhaseRecord[], projectStatus?: string): PhaseId {
  const current = deriveCurrentPhase(projectStatus);
  const order = PHASE_CATALOG.map((p) => p.id);
  const currentIdx = order.indexOf(current);

  for (let i = 0; i < phases.length; i += 1) {
    const phase = phases[i]!;
    const idx = order.indexOf(phase.id);
    if (projectStatus === "Failed" && phase.id === "ERROR") {
      phase.status = "RUNNING";
      continue;
    }
    if (projectStatus === "Delivered" && phase.id === "DONE") {
      phase.status = "DONE";
      continue;
    }
    if (idx < currentIdx) phase.status = "DONE";
    else if (idx === currentIdx) phase.status = "RUNNING";
    else phase.status = "PENDING";
  }

  if (projectStatus === "Delivered") {
    for (const phase of phases) {
      if (phase.id !== "DONE" && phase.id !== "ERROR") phase.status = "DONE";
    }
  }

  return current;
}

export function parseProgressPct(snapshot?: ConsoleSnapshot): number {
  const label = snapshot?.phase.progressLabel ?? "";
  const slice = label.match(/(\d+)\s*\/\s*(\d+)/);
  if (slice) {
    const current = Number(slice[1]);
    const total = Number(slice[2]);
    if (total > 0) return Math.round((current / total) * 100);
  }
  const pct = label.match(/(\d+)%/);
  if (pct) return Number(pct[1]);

  const status = snapshot?.project.status;
  const map: Record<string, number> = {
    "Draft Requirement": 5,
    "Asking Questions": 18,
    "PRD Ready": 28,
    "Tech Plan Review": 35,
    Developing: 55,
    "Change Review": 62,
    Testing: 78,
    Deploying: 88,
    "Awaiting Acceptance": 92,
    Delivered: 100,
    Failed: 0,
  };
  if (status && map[status] !== undefined) {
    let base = map[status];
    if (status === "Developing" && snapshot?.dev) {
      const { sliceIndex, sliceTotal } = snapshot.dev;
      if (sliceTotal > 0) {
        base = 35 + Math.round((sliceIndex / sliceTotal) * 40);
      }
    }
    if (status === "Testing" && snapshot?.testing) {
      const { suitePassed, suiteTotal } = snapshot.testing;
      if (suiteTotal > 0) {
        base = 70 + Math.round((suitePassed / suiteTotal) * 18);
      }
    }
    return base;
  }
  return 0;
}
