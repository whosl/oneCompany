import {
  AnalystOutputSchema,
  appendCustomGateNote,
  getAllowedOptions,
  IntakeOutputSchema,
  PrdAcceptanceOutputSchema,
  QuestionPlannerOutputSchema,
  resolveGateDecision,
  ScorerOutputSchema,
  type RequirementState,
} from "@oc/shared";
import {
  REQUIREMENT_AGENT_IDS,
  type RequirementAgentTask,
  type RequirementFixtureProfile,
} from "@oc/agent-core";
import {
  canAskAnotherRound,
  isReadyForPrd,
  shouldRaiseStuckGate,
} from "./loop-policy.js";
import { savePrdAndAcceptance } from "./prd.js";
import {
  appendRequirementScore,
  createRequirementSession,
  loadRequirementSession,
  saveRequirementSession,
  updateSessionMeta,
} from "./state.js";
import { applyRequirementIntegrations } from "../integrations/requirement-enable.js";
import type {
  RequirementRunResult,
  RequirementSessionPayload,
  RequirementWorkflowDeps,
} from "./types.js";
import {
  REQUIREMENT_CONFIRM_GATE_TYPE,
  REQUIREMENT_STUCK_GATE_TYPE,
  STUCK_BUDGET_EXTENSION as BUDGET_EXTENSION,
} from "./types.js";

function makeTask(
  state: RequirementState,
  profile: RequirementFixtureProfile,
): RequirementAgentTask {
  return { state, profile };
}

async function runIntake(deps: RequirementWorkflowDeps, payload: RequirementSessionPayload) {
  const result = await deps.runAgent({
    projectId: payload.state.projectId,
    agentIdAtVersion: REQUIREMENT_AGENT_IDS.intake,
    task: makeTask(payload.state, payload.meta.profile),
  });
  const output = IntakeOutputSchema.parse(result.output);
  payload.state = {
    ...payload.state,
    normalizedSummary: output.normalizedSummary,
    targetUsers: output.targetUsers,
    userGoals: output.userGoals,
  };
}

async function runAnalyst(deps: RequirementWorkflowDeps, payload: RequirementSessionPayload) {
  const result = await deps.runAgent({
    projectId: payload.state.projectId,
    agentIdAtVersion: REQUIREMENT_AGENT_IDS.analyst,
    task: makeTask(payload.state, payload.meta.profile),
  });
  const output = AnalystOutputSchema.parse(result.output);
  const { normalizedIntegrations, warnings } = await applyRequirementIntegrations(
    { db: deps.db, projectId: payload.state.projectId, onEvent: deps.onEvent },
    output.integrations,
  );

  payload.state = {
    ...payload.state,
    coreFeatures: output.coreFeatures,
    pagesAndFlows: output.pagesAndFlows,
    dataObjects: output.dataObjects,
    rolesAndPermissions: output.rolesAndPermissions,
    integrations:
      normalizedIntegrations.length > 0 ? normalizedIntegrations : output.integrations,
    nonFunctionalRequirements: output.nonFunctionalRequirements,
    assumptions: [...payload.state.assumptions, ...output.assumptions],
    risks: warnings.length > 0 ? [...payload.state.risks, ...warnings] : payload.state.risks,
  };
}

async function runScorer(
  deps: RequirementWorkflowDeps,
  payload: RequirementSessionPayload,
  roundIndex: number,
) {
  const result = await deps.runAgent({
    projectId: payload.state.projectId,
    agentIdAtVersion: REQUIREMENT_AGENT_IDS.scorer,
    task: makeTask(payload.state, payload.meta.profile),
  });
  const output = ScorerOutputSchema.parse(result.output);
  payload.state = {
    ...payload.state,
    completenessScore: output.completenessScore,
    gaps: output.gaps,
  };
  appendRequirementScore(deps.db, payload.state.projectId, roundIndex, output.completenessScore);

  const lastRoundIndex = payload.state.questionRounds.length - 1;
  if (lastRoundIndex >= 0 && payload.state.questionRounds[lastRoundIndex]!.answers.length > 0) {
    const rounds = [...payload.state.questionRounds];
    rounds[lastRoundIndex] = {
      ...rounds[lastRoundIndex]!,
      scoreAfter: output.completenessScore,
    };
    payload.state = { ...payload.state, questionRounds: rounds };
  }
}

async function runQuestionPlanner(
  deps: RequirementWorkflowDeps,
  payload: RequirementSessionPayload,
) {
  const result = await deps.runAgent({
    projectId: payload.state.projectId,
    agentIdAtVersion: REQUIREMENT_AGENT_IDS.questionPlanner,
    task: makeTask(payload.state, payload.meta.profile),
  });
  const output = QuestionPlannerOutputSchema.parse(result.output);
  payload.state = {
    ...payload.state,
    questionRounds: [
      ...payload.state.questionRounds,
      {
        topic: output.topic,
        questions: output.questions,
        answers: [],
        scoreAfter: 0,
      },
    ],
  };
}

async function runPrdAcceptance(
  deps: RequirementWorkflowDeps,
  payload: RequirementSessionPayload,
): Promise<RequirementSessionPayload> {
  const result = await deps.runAgent({
    projectId: payload.state.projectId,
    agentIdAtVersion: REQUIREMENT_AGENT_IDS.prdAcceptance,
    task: makeTask(payload.state, payload.meta.profile),
  });
  PrdAcceptanceOutputSchema.parse(result.output);
  const saved = savePrdAndAcceptance(
    deps.db,
    payload.state,
    result.output,
    deps.onEvent,
  );
  return updateSessionMeta(
    { ...payload, state: saved.state },
    { phase: "completed" },
  );
}

function toResult(
  deps: RequirementWorkflowDeps,
  payload: RequirementSessionPayload,
): RequirementRunResult {
  const lastRound = payload.state.questionRounds.at(-1);
  return {
    phase: payload.meta.phase,
    projectStatus: deps.getProjectStatus(payload.state.projectId),
    questions:
      payload.meta.phase === "awaiting_answers"
        ? lastRound?.questions.map((item) => item.question)
        : undefined,
    gateId: payload.meta.gateId,
    gateOptions:
      payload.meta.phase === "awaiting_gate"
        ? [...getAllowedOptions(payload.meta.gateType ?? REQUIREMENT_STUCK_GATE_TYPE)]
        : undefined,
    state: payload.state,
  };
}

async function decideAndContinue(
  deps: RequirementWorkflowDeps,
  payload: RequirementSessionPayload,
): Promise<RequirementRunResult> {
  const currentStatus = deps.getProjectStatus(payload.state.projectId);

  if (isReadyForPrd(payload.state)) {
    const completed = await runPrdAcceptance(deps, payload);
    const gate = deps.createGate(payload.state.projectId, REQUIREMENT_CONFIRM_GATE_TYPE);
    const waiting = updateSessionMeta(completed, {
      phase: "awaiting_gate",
      gateId: gate.id,
      gateType: REQUIREMENT_CONFIRM_GATE_TYPE,
    });
    saveRequirementSession(deps.db, payload.state.projectId, waiting);
    if (currentStatus === "Draft Requirement" || currentStatus === "Asking Questions") {
      deps.setStatus(payload.state.projectId, "PRD Ready", "requirement_complete");
    }
    return toResult(deps, waiting);
  }

  if (shouldRaiseStuckGate(payload.state)) {
    const gate = deps.createGate(payload.state.projectId, REQUIREMENT_STUCK_GATE_TYPE);
    const waiting = updateSessionMeta(payload, {
      phase: "awaiting_gate",
      gateId: gate.id,
      gateType: REQUIREMENT_STUCK_GATE_TYPE,
    });
    if (currentStatus === "Draft Requirement") {
      deps.setStatus(payload.state.projectId, "Asking Questions", "requirement_stuck");
    }
    saveRequirementSession(deps.db, payload.state.projectId, waiting);
    return toResult(deps, waiting);
  }

  if (canAskAnotherRound(payload.state)) {
    await runQuestionPlanner(deps, payload);
    const waiting = updateSessionMeta(payload, { phase: "awaiting_answers" });
    if (currentStatus === "Draft Requirement") {
      deps.setStatus(payload.state.projectId, "Asking Questions", "requirement_questions");
    }
    saveRequirementSession(deps.db, payload.state.projectId, waiting);
    return toResult(deps, waiting);
  }

  throw new Error("Requirement loop reached an unexpected state");
}

export async function startRequirementLegacy(
  deps: RequirementWorkflowDeps,
  input: {
    projectId: string;
    requirement: string;
    profile?: RequirementFixtureProfile;
  },
): Promise<RequirementRunResult> {
  const profile = input.profile ?? "vague";
  let payload = createRequirementSession(
    deps.db,
    input.projectId,
    input.requirement,
    profile,
  );

  await runIntake(deps, payload);
  await runAnalyst(deps, payload);
  await runScorer(deps, payload, 0);
  saveRequirementSession(deps.db, input.projectId, payload);

  return decideAndContinue(deps, payload);
}

export async function submitRequirementAnswersLegacy(
  deps: RequirementWorkflowDeps,
  input: { projectId: string; answers: string[] },
): Promise<RequirementRunResult> {
  const payload = loadRequirementSession(deps.db, input.projectId);
  if (payload.meta.phase !== "awaiting_answers") {
    throw new Error(`Expected awaiting_answers, got ${payload.meta.phase}`);
  }

  const lastIndex = payload.state.questionRounds.length - 1;
  if (lastIndex < 0) {
    throw new Error("No active question round");
  }

  const rounds = [...payload.state.questionRounds];
  rounds[lastIndex] = {
    ...rounds[lastIndex]!,
    answers: input.answers,
  };
  payload.state = { ...payload.state, questionRounds: rounds };
  payload.meta.phase = "running";

  await runScorer(deps, payload, lastIndex + 1);
  saveRequirementSession(deps.db, input.projectId, payload);

  return decideAndContinue(deps, payload);
}

export async function resumeRequirementAfterGateLegacy(
  deps: RequirementWorkflowDeps,
  input: { projectId: string; decision: string },
): Promise<RequirementRunResult> {
  const payload = loadRequirementSession(deps.db, input.projectId);
  if (payload.meta.phase !== "awaiting_gate") {
    throw new Error(`Expected awaiting_gate, got ${payload.meta.phase}`);
  }

  if (payload.meta.gateType === REQUIREMENT_CONFIRM_GATE_TYPE) {
    const { effective, customText } = resolveGateDecision(
      REQUIREMENT_CONFIRM_GATE_TYPE,
      input.decision,
    );
    switch (effective) {
      case "approve": {
        const completed = updateSessionMeta(
          {
            ...payload,
            state: {
              ...payload.state,
              risks: appendCustomGateNote(
                payload.state.risks,
                REQUIREMENT_CONFIRM_GATE_TYPE,
                customText,
              ),
            },
          },
          {
            phase: "completed",
            gateId: undefined,
            gateType: undefined,
          },
        );
        saveRequirementSession(deps.db, input.projectId, completed);
        return toResult(deps, completed);
      }
      case "revise_then_approve":
      case "reject_and_redo": {
        const revised = updateSessionMeta(payload, {
          phase: "awaiting_answers",
          gateId: undefined,
          gateType: undefined,
        });
        deps.setStatus(input.projectId, "Asking Questions", "requirement_confirm_revise");
        saveRequirementSession(deps.db, input.projectId, revised);
        return toResult(deps, revised);
      }
      default:
        throw new Error(`Unsupported requirement confirmation decision: ${input.decision}`);
    }
  }

  switch (input.decision) {
    case "keep_answering": {
      payload.state = {
        ...payload.state,
        maxQuestionRounds: payload.state.maxQuestionRounds + BUDGET_EXTENSION,
      };
      payload.meta.phase = "running";
      saveRequirementSession(deps.db, input.projectId, payload);
      // Go straight to another question round: decideAndContinue would
      // re-evaluate isStuck (no new answers yet) and immediately raise the
      // same stuck gate again instead of asking more questions.
      await runQuestionPlanner(deps, payload);
      const waiting = updateSessionMeta(payload, { phase: "awaiting_answers" });
      saveRequirementSession(deps.db, input.projectId, waiting);
      return toResult(deps, waiting);
    }
    case "force_continue": {
      payload.state = {
        ...payload.state,
        risks: [
          ...payload.state.risks,
          "Requirement completed below completeness threshold via human force-continue at stuck gate",
        ],
      };
      const completed = await runPrdAcceptance(deps, payload);
      const gate = deps.createGate(input.projectId, REQUIREMENT_CONFIRM_GATE_TYPE);
      const waiting = updateSessionMeta(completed, {
        phase: "awaiting_gate",
        gateId: gate.id,
        gateType: REQUIREMENT_CONFIRM_GATE_TYPE,
      });
      saveRequirementSession(deps.db, input.projectId, waiting);
      deps.setStatus(input.projectId, "PRD Ready", "requirement_force_continue");
      return toResult(deps, waiting);
    }
    case "fail": {
      const failed = updateSessionMeta(payload, { phase: "failed" });
      saveRequirementSession(deps.db, input.projectId, failed);
      deps.setStatus(input.projectId, "Failed", "requirement_stuck_fail");
      return toResult(deps, failed);
    }
    default:
      throw new Error(`Unsupported gate decision: ${input.decision}`);
  }
}
