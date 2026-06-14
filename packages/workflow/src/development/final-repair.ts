import {
  emit,
  getAllowedOptions,
  type FunctionSliceTask,
  type NormalizedRunnerResult,
} from "@oc/shared";
import { beginSliceLoopInBackground } from "./engine-legacy.js";
import { isSliceLoopActive } from "./slice-loop-registry.js";
import { loadDevSession, saveDevSession } from "./state.js";
import {
  SLICE_FAILURE_GATE,
  type DevelopmentRunResult,
  type DevelopmentSessionPayload,
  type DevelopmentWorkflowDeps,
} from "./types.js";

export const MAX_AUTOMATIC_FINAL_REPAIR_ATTEMPTS = 3;

export type StartFinalRepairInput = {
  projectId: string;
  suiteResults?: NormalizedRunnerResult[];
  qaNotes?: string[];
  requestDeploy?: boolean;
};

function failedSuiteResults(
  payload: DevelopmentSessionPayload,
  provided?: NormalizedRunnerResult[],
): NormalizedRunnerResult[] {
  return (provided ?? payload.testing?.suiteResults ?? []).filter(
    (result) => result.status === "failed",
  );
}

function buildRepairTask(
  taskSequence: number,
  failures: NormalizedRunnerResult[],
  qaNotes: string[],
): FunctionSliceTask {
  const suites = failures.map((result) => result.suite);
  const diagnostics = failures
    .map((result) => `- ${result.suite}: ${result.details ?? "no details"}`)
    .join("\n");
  const qa = qaNotes.length > 0 ? qaNotes.map((note) => `- ${note}`).join("\n") : "- 无";

  return {
    id: `final-repair-${taskSequence}`,
    title: `修复最终测试失败（${suites.join(", ")}）`,
    description: [
      "最终验证失败。定位根因并直接修改代码，不要绕过、跳过或弱化测试。",
      "",
      "失败详情：",
      diagnostics,
      "",
      "QA 诊断：",
      qa,
      "",
      "修复后必须保持现有功能不回归；平台会重新执行完整 final:typecheck/build/vitest/playwright。",
    ].join("\n"),
    acceptanceChecks: [
      ...suites.map((suite) => `${suite} 的根因已修复`),
      "现有 Vitest 测试通过",
      "全仓类型检查通过",
      "允许平台重新执行完整最终测试套件",
    ],
    testCommand: "pnpm vitest run --reporter=json",
    status: "pending",
  };
}

function nextRepairTaskSequence(payload: DevelopmentSessionPayload): number {
  const historicalMaximum = payload.state.taskQueue.reduce((maximum, task) => {
    const match = /^final-repair-(\d+)$/.exec(task.id);
    return match ? Math.max(maximum, Number(match[1])) : maximum;
  }, 0);
  return Math.max(historicalMaximum, payload.meta.finalRepair?.attempt ?? 0) + 1;
}

function toResult(
  deps: DevelopmentWorkflowDeps,
  payload: DevelopmentSessionPayload,
): DevelopmentRunResult {
  const gateType = payload.meta.gateType;
  return {
    phase: payload.meta.phase,
    projectStatus: deps.getProjectStatus(payload.state.projectId),
    gateId: payload.meta.gateId,
    gateType,
    gateOptions: gateType ? [...getAllowedOptions(gateType)] : undefined,
    state: payload.state,
  };
}

export function startFinalRepair(
  deps: DevelopmentWorkflowDeps,
  input: StartFinalRepairInput,
): DevelopmentRunResult {
  if (deps.getProjectStatus(input.projectId) !== "Developing") {
    throw new Error("Final repair requires project status Developing");
  }
  if (isSliceLoopActive(input.projectId)) {
    throw new Error("开发循环正在运行中，无需重复创建最终失败修复任务");
  }

  const payload = loadDevSession(deps.db, input.projectId);
  if (payload.testing?.phase !== "failed") {
    throw new Error(`Final repair requires failed testing session, got ${payload.testing?.phase ?? "none"}`);
  }

  const failures = failedSuiteResults(payload, input.suiteResults);
  if (failures.length === 0) {
    throw new Error("Final repair requires at least one failed final suite");
  }

  const attempt = (payload.meta.finalRepair?.attempt ?? 0) + 1;
  const taskSequence = nextRepairTaskSequence(payload);
  const qaNotes = input.qaNotes ?? payload.testing.qaNotes ?? [];
  const requestDeploy = input.requestDeploy ?? payload.testing.requestDeploy ?? false;
  const task = buildRepairTask(taskSequence, failures, qaNotes);
  const nextState = {
    ...payload.state,
    taskQueue: [...payload.state.taskQueue, task],
    currentTask: undefined,
    currentSliceAttempts: 0,
  };
  const finalRepair = {
    attempt,
    failedSuites: failures.map((result) => result.suite),
    qaNotes,
    requestDeploy,
    pendingRetest: true,
  };

  deps.onEvent?.(
    emit(deps.db, {
      projectId: input.projectId,
      agentId: "coding",
      payload: {
        type: "agent.plan",
        projectId: input.projectId,
        agentId: "coding",
        summary: `已创建最终失败修复任务 ${task.id}：${finalRepair.failedSuites.join(", ")}`,
      },
    }),
  );

  if (attempt > MAX_AUTOMATIC_FINAL_REPAIR_ATTEMPTS) {
    const gate = deps.createGate(input.projectId, SLICE_FAILURE_GATE);
    const gated: DevelopmentSessionPayload = {
      ...payload,
      state: {
        ...nextState,
        taskQueue: nextState.taskQueue.map((item) =>
          item.id === task.id ? { ...item, status: "failed" as const } : item,
        ),
      },
      meta: {
        ...payload.meta,
        phase: "awaiting_gate",
        gateId: gate.id,
        gateType: SLICE_FAILURE_GATE,
        currentSliceId: task.id,
        finalRepair,
      },
    };
    saveDevSession(deps.db, input.projectId, gated);
    return toResult(deps, gated);
  }

  const next: DevelopmentSessionPayload = {
    ...payload,
    state: nextState,
    meta: {
      ...payload.meta,
      phase: "slicing",
      gateId: undefined,
      gateType: undefined,
      currentSliceId: task.id,
      finalRepair,
    },
  };
  saveDevSession(deps.db, input.projectId, next);
  return beginSliceLoopInBackground(deps, next);
}
