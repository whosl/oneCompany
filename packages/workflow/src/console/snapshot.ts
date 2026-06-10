import { desc, eq } from "drizzle-orm";
import {
  listEvents,
  projectStatusHistory,
  projects,
  type ConsoleSnapshot,
  type Db,
} from "@oc/shared";
import { parseProjectStatus } from "@oc/shared";
import { loadDevSession } from "../development/state.js";
import { loadRequirementSession } from "../requirement/state.js";
import { derivePhaseFromStatus, isCompletenessLocked } from "./phase.js";

type GateRecord = {
  id: string;
  gateType: string;
  status: "open" | "resolved";
  options: string[];
  decision: string | null;
  createdAt: string;
};

export function buildConsoleSnapshot(
  db: Db,
  projectId: string,
  openGates: GateRecord[],
): ConsoleSnapshot {
  const row = db.select().from(projects).where(eq(projects.id, projectId)).all()[0];
  if (!row) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const status = parseProjectStatus(row.status);
  let requirement: ConsoleSnapshot["requirement"];
  let dev: ConsoleSnapshot["dev"];
  let testing: ConsoleSnapshot["testing"];
  let risks: string[] = [];

  try {
    const reqPayload = loadRequirementSession(db, projectId);
    const state = reqPayload.state;
    const lastRound = state.questionRounds.at(-1);
    const awaitingAnswers =
      reqPayload.meta.phase === "awaiting_answers" || status === "Asking Questions";
    const defaultSuggestions = [
      "Proceed as described in the current requirement",
      "Use a narrower MVP scope",
      "Expand scope with additional features",
    ];
    const pendingQuestions =
      awaitingAnswers &&
      lastRound &&
      lastRound.questions.length > 0 &&
      lastRound.answers.length === 0
        ? lastRound.questions.map((item) => ({
            question: item.question,
            suggestedAnswers:
              item.suggestedAnswers.length > 0 ? item.suggestedAnswers : defaultSuggestions,
          }))
        : undefined;
    requirement = {
      rawRequirement: state.rawRequirement,
      normalizedSummary: state.normalizedSummary || state.rawRequirement,
      completenessScore: state.completenessScore,
      completenessLocked: isCompletenessLocked(status),
      settledChips: state.rolesAndPermissions.length
        ? ["角色权限已定"]
        : [],
      upcomingChips: state.gaps.length
        ? [state.gaps[0]?.question ?? "需要补充信息"]
        : [],
      pendingQuestions,
    };
    risks = [...state.risks];
  } catch {
    requirement = undefined;
  }

  try {
    const devPayload = loadDevSession(db, projectId);
    const queue = devPayload.state.taskQueue;
    const current = devPayload.state.currentTask;
    const passed = queue.filter((slice) => slice.status === "passed").length;
    const currentIndex = current
      ? queue.findIndex((slice) => slice.id === current.id)
      : passed;
    dev = {
      currentSliceId: current?.id,
      sliceIndex: currentIndex >= 0 ? currentIndex : passed,
      sliceTotal: queue.length,
      previewUrl: devPayload.state.previewUrl ?? devPayload.testing?.previewUrl,
    };
    risks = [...risks, ...devPayload.state.risks];
    if (devPayload.testing) {
      const suiteResults = devPayload.testing.suiteResults ?? [];
      testing = {
        phase: devPayload.testing.phase,
        previewUrl: devPayload.testing.previewUrl,
        suitePassed: suiteResults.filter((r) => r.status === "passed").length,
        suiteTotal: suiteResults.length,
      };
    }
  } catch {
    dev = undefined;
  }

  const pausedFrom = getPausedFrom(db, projectId);
  const events = listEvents(db, projectId);
  const lastSeq = events.at(-1)?.seq ?? 0;

  const phase = derivePhaseFromStatus(status, {
    completenessScore: requirement?.completenessScore,
    sliceIndex: dev?.sliceIndex,
    sliceTotal: dev?.sliceTotal,
    suitePassed: testing?.suitePassed,
    suiteTotal: testing?.suiteTotal,
  });

  return {
    project: {
      id: row.id,
      name: row.name,
      slug: row.slug,
      status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    phase,
    requirement,
    dev,
    testing,
    risks,
    openGates: openGates.map((gate) => ({
      id: gate.id,
      gateType: gate.gateType,
      status: gate.status,
      options: gate.options,
      decision: gate.decision,
      createdAt: gate.createdAt,
      metadata: gate.metadata,
    })),
    pausedFrom,
    events,
    lastSeq,
  };
}

function getPausedFrom(db: Db, projectId: string): ConsoleSnapshot["pausedFrom"] {
  const entries = db
    .select({
      fromStatus: projectStatusHistory.from_status,
      toStatus: projectStatusHistory.to_status,
    })
    .from(projectStatusHistory)
    .where(eq(projectStatusHistory.project_id, projectId))
    .orderBy(desc(projectStatusHistory.created_at))
    .all();

  const latestPause = entries.find((entry) => entry.toStatus === "Paused");
  return latestPause ? parseProjectStatus(latestPause.fromStatus) : undefined;
}

