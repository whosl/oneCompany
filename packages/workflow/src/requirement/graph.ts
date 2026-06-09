import {
  AnalystOutputSchema,
  IntakeOutputSchema,
  PrdAcceptanceOutputSchema,
  QuestionPlannerOutputSchema,
  ScorerOutputSchema,
  getAllowedOptions,
} from "@oc/shared";
import {
  REQUIREMENT_AGENT_IDS,
  type RequirementAgentTask,
} from "@oc/agent-core";
import { Annotation, Command, END, START, StateGraph, interrupt } from "@langchain/langgraph";
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
import type {
  RequirementRunResult,
  RequirementSessionPayload,
  RequirementWorkflowDeps,
} from "./types.js";
import {
  REQUIREMENT_STUCK_GATE_TYPE,
  STUCK_BUDGET_EXTENSION as BUDGET_EXTENSION,
} from "./types.js";
import { hasGraphCheckpoint, resolveGraphCheckpointer } from "../graph/checkpointer.js";
import {
  resumeRequirementAfterGateLegacy,
  submitRequirementAnswersLegacy,
} from "./engine-legacy.js";

const RequirementGraphAnnotation = Annotation.Root({
  payload: Annotation<RequirementSessionPayload>,
  scorerRoundIndex: Annotation<number>,
  result: Annotation<RequirementRunResult | undefined>,
});

type RequirementGraphState = typeof RequirementGraphAnnotation.State;

function makeTask(
  state: RequirementGraphState["payload"]["state"],
  profile: RequirementGraphState["payload"]["meta"]["profile"],
): RequirementAgentTask {
  return { state, profile };
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
      payload.meta.phase === "awaiting_answers" ? lastRound?.questions : undefined,
    gateId: payload.meta.gateId,
    gateOptions:
      payload.meta.phase === "awaiting_gate"
        ? [...getAllowedOptions(REQUIREMENT_STUCK_GATE_TYPE)]
        : undefined,
    state: payload.state,
  };
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
  payload.state = {
    ...payload.state,
    coreFeatures: output.coreFeatures,
    pagesAndFlows: output.pagesAndFlows,
    dataObjects: output.dataObjects,
    rolesAndPermissions: output.rolesAndPermissions,
    integrations: output.integrations,
    nonFunctionalRequirements: output.nonFunctionalRequirements,
    assumptions: [...payload.state.assumptions, ...output.assumptions],
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
  return updateSessionMeta({ ...payload, state: saved.state }, { phase: "completed" });
}

function routeAfterDecide(state: RequirementGraphState): string {
  const payload = state.payload;
  if (isReadyForPrd(payload.state)) {
    return "prdAcceptance";
  }
  if (shouldRaiseStuckGate(payload.state)) {
    return "prepareStuckGate";
  }
  if (canAskAnotherRound(payload.state)) {
    return "questionPlanner";
  }
  return "unexpected";
}

export function buildRequirementGraph(deps: RequirementWorkflowDeps) {
  const intakeNode = async (state: RequirementGraphState): Promise<Partial<RequirementGraphState>> => {
    const payload = { ...state.payload };
    await runIntake(deps, payload);
    return { payload, scorerRoundIndex: 0 };
  };

  const analystNode = async (state: RequirementGraphState): Promise<Partial<RequirementGraphState>> => {
    const payload = { ...state.payload };
    await runAnalyst(deps, payload);
    return { payload };
  };

  const scorerNode = async (state: RequirementGraphState): Promise<Partial<RequirementGraphState>> => {
    const payload = { ...state.payload };
    await runScorer(deps, payload, state.scorerRoundIndex ?? 0);
    saveRequirementSession(deps.db, payload.state.projectId, payload);
    return { payload };
  };

  const prdNode = async (state: RequirementGraphState): Promise<Partial<RequirementGraphState>> => {
    const payload = { ...state.payload };
    const currentStatus = deps.getProjectStatus(payload.state.projectId);
    const completed = await runPrdAcceptance(deps, payload);
    saveRequirementSession(deps.db, payload.state.projectId, completed);
    if (currentStatus === "Draft Requirement" || currentStatus === "Asking Questions") {
      deps.setStatus(payload.state.projectId, "PRD Ready", "requirement_complete");
    }
    return { payload: completed, result: toResult(deps, completed) };
  };

  const prepareStuckGateNode = async (
    state: RequirementGraphState,
  ): Promise<Partial<RequirementGraphState>> => {
    const payload = { ...state.payload };
    const gate = deps.createGate(payload.state.projectId, REQUIREMENT_STUCK_GATE_TYPE);
    const waiting = updateSessionMeta(payload, {
      phase: "awaiting_gate",
      gateId: gate.id,
    });
    if (deps.getProjectStatus(payload.state.projectId) === "Draft Requirement") {
      deps.setStatus(payload.state.projectId, "Asking Questions", "requirement_stuck");
    }
    saveRequirementSession(deps.db, payload.state.projectId, waiting);
    return { payload: waiting };
  };

  const waitStuckGateNode = async (
    state: RequirementGraphState,
  ): Promise<Partial<RequirementGraphState>> => {
    const decision = interrupt({
      type: "requirement_stuck_gate",
      gateId: state.payload.meta.gateId,
    }) as string;

    let payload = { ...state.payload };
    switch (decision) {
      case "keep_answering": {
        payload.state = {
          ...payload.state,
          maxQuestionRounds: payload.state.maxQuestionRounds + BUDGET_EXTENSION,
        };
        payload.meta.phase = "running";
        saveRequirementSession(deps.db, payload.state.projectId, payload);
        return { payload, scorerRoundIndex: payload.state.questionRounds.length };
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
        saveRequirementSession(deps.db, payload.state.projectId, completed);
        deps.setStatus(payload.state.projectId, "PRD Ready", "requirement_force_continue");
        return { payload: completed, result: toResult(deps, completed) };
      }
      case "fail": {
        const failed = updateSessionMeta(payload, { phase: "failed" });
        saveRequirementSession(deps.db, payload.state.projectId, failed);
        deps.setStatus(payload.state.projectId, "Failed", "requirement_stuck_fail");
        return { payload: failed, result: toResult(deps, failed) };
      }
      default:
        throw new Error(`Unsupported gate decision: ${decision}`);
    }
  };

  const questionPlannerNode = async (
    state: RequirementGraphState,
  ): Promise<Partial<RequirementGraphState>> => {
    const payload = { ...state.payload };
    await runQuestionPlanner(deps, payload);
    const waiting = updateSessionMeta(payload, { phase: "awaiting_answers" });
    if (deps.getProjectStatus(payload.state.projectId) === "Draft Requirement") {
      deps.setStatus(payload.state.projectId, "Asking Questions", "requirement_questions");
    }
    saveRequirementSession(deps.db, payload.state.projectId, waiting);
    return { payload: waiting };
  };

  const waitAnswersNode = async (
    state: RequirementGraphState,
  ): Promise<Partial<RequirementGraphState>> => {
    const answers = interrupt({
      type: "requirement_answers",
      projectId: state.payload.state.projectId,
    }) as string[];

    const payload = { ...state.payload };
    const lastIndex = payload.state.questionRounds.length - 1;
    if (lastIndex < 0) {
      throw new Error("No active question round");
    }

    const rounds = [...payload.state.questionRounds];
    rounds[lastIndex] = {
      ...rounds[lastIndex]!,
      answers,
    };
    payload.state = { ...payload.state, questionRounds: rounds };
    payload.meta.phase = "running";
    return {
      payload,
      scorerRoundIndex: lastIndex + 1,
    };
  };

  const unexpectedNode = async (): Promise<Partial<RequirementGraphState>> => {
    throw new Error("Requirement loop reached an unexpected state");
  };

  const graph = new StateGraph(RequirementGraphAnnotation)
    .addNode("intake", intakeNode)
    .addNode("analyst", analystNode)
    .addNode("scorer", scorerNode)
    .addNode("prdAcceptance", prdNode)
    .addNode("prepareStuckGate", prepareStuckGateNode)
    .addNode("waitStuckGate", waitStuckGateNode)
    .addNode("questionPlanner", questionPlannerNode)
    .addNode("waitAnswers", waitAnswersNode)
    .addNode("unexpected", unexpectedNode)
    .addEdge(START, "intake")
    .addEdge("intake", "analyst")
    .addEdge("analyst", "scorer")
    .addConditionalEdges("scorer", routeAfterDecide, {
      prdAcceptance: "prdAcceptance",
      prepareStuckGate: "prepareStuckGate",
      questionPlanner: "questionPlanner",
      unexpected: "unexpected",
    })
    .addEdge("prdAcceptance", END)
    .addEdge("prepareStuckGate", "waitStuckGate")
    .addConditionalEdges("waitStuckGate", (state) => {
      if (state.result) {
        return END;
      }
      return "scorer";
    })
    .addEdge("questionPlanner", "waitAnswers")
    .addConditionalEdges("waitAnswers", (state) => {
      if (state.result) {
        return END;
      }
      return "scorer";
    });

  return graph.compile({ checkpointer: resolveGraphCheckpointer() });
}

function graphConfig(projectId: string) {
  return { configurable: { thread_id: projectId } };
}

export function useGraphRequirementEngine(): boolean {
  return process.env.OC_USE_LEGACY_ENGINE !== "1";
}

export async function startRequirementGraph(
  deps: RequirementWorkflowDeps,
  input: {
    projectId: string;
    requirement: string;
    profile?: RequirementSessionPayload["meta"]["profile"];
  },
): Promise<RequirementRunResult> {
  const profile = input.profile ?? "vague";
  const payload = createRequirementSession(deps.db, input.projectId, input.requirement, profile);
  const graph = buildRequirementGraph(deps);
  const finalState = (await graph.invoke(
    { payload, scorerRoundIndex: 0 },
    graphConfig(input.projectId),
  )) as RequirementGraphState;

  if (finalState.result) {
    return finalState.result;
  }

  const halted = finalState.payload;
  saveRequirementSession(deps.db, input.projectId, halted);
  return toResult(deps, halted);
}

export async function submitRequirementAnswersGraph(
  deps: RequirementWorkflowDeps,
  input: { projectId: string; answers: string[] },
): Promise<RequirementRunResult> {
  const existing = loadRequirementSession(deps.db, input.projectId);
  if (existing.meta.phase !== "awaiting_answers") {
    throw new Error(`Expected awaiting_answers, got ${existing.meta.phase}`);
  }

  if (!(await hasGraphCheckpoint(input.projectId))) {
    return submitRequirementAnswersLegacy(deps, input);
  }

  const graph = buildRequirementGraph(deps);
  const finalState = (await graph.invoke(
    new Command({ resume: input.answers }),
    graphConfig(input.projectId),
  )) as RequirementGraphState;

  if (finalState.result) {
    return finalState.result;
  }

  saveRequirementSession(deps.db, input.projectId, finalState.payload);
  return toResult(deps, finalState.payload);
}

export async function resumeRequirementAfterGateGraph(
  deps: RequirementWorkflowDeps,
  input: { projectId: string; decision: string },
): Promise<RequirementRunResult> {
  const existing = loadRequirementSession(deps.db, input.projectId);
  if (existing.meta.phase !== "awaiting_gate") {
    throw new Error(`Expected awaiting_gate, got ${existing.meta.phase}`);
  }

  if (!(await hasGraphCheckpoint(input.projectId))) {
    return resumeRequirementAfterGateLegacy(deps, input);
  }

  const graph = buildRequirementGraph(deps);
  const finalState = (await graph.invoke(
    new Command({ resume: input.decision }),
    graphConfig(input.projectId),
  )) as RequirementGraphState;

  if (finalState.result) {
    return finalState.result;
  }

  saveRequirementSession(deps.db, input.projectId, finalState.payload);
  return toResult(deps, finalState.payload);
}
