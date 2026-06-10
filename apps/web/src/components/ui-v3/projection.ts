import type { ConsoleProjection } from "@/lib/projection/types";
import type { ConsoleSnapshot } from "@oc/shared";

type SnapshotGate = ConsoleSnapshot["openGates"][number] & {
  metadata?: IntegrationGateMetadata & { riskLevel?: "low" | "medium" | "high" };
};

function readGateMetadata(gate: SnapshotGate): IntegrationGateMetadata | undefined {
  return gate.metadata;
}
import {
  formatIntegrationGateReason,
  formatIntegrationToolLabel,
  getGatePresentation,
  type IntegrationGateMetadata,
} from "@/lib/gate-presentations";
import { adaptConsoleProjection } from "../ui-v2/adapter";
import type { AgentRunStatus, OpenGate } from "../ui-v2/types";
import { AGENT_ROSTER, LIFECYCLE_STEPS } from "./constants";
import type {
  UiV3AgentState,
  UiV3ContextualAction,
  UiV3GateView,
  UiV3LifecycleState,
  UiV3Projection,
} from "./types";

function resolveLifecycle(status: string, pausedFrom?: string): UiV3LifecycleState {
  if (status === "Paused") {
    const resumed = pausedFrom ?? "Draft Requirement";
    const step = LIFECYCLE_STEPS.find((candidate) => candidate.statuses.includes(resumed));
    const stepIndex = step ? LIFECYCLE_STEPS.indexOf(step) : 0;
    return {
      currentStepId: "paused",
      stepIndex,
      label: `已暂停 · 恢复后回到 ${resumed}`,
      isTerminal: false,
    };
  }
  if (status === "Failed") {
    return { currentStepId: "failed", stepIndex: -1, label: "项目失败", isTerminal: true };
  }
  if (status === "Delivered") {
    return {
      currentStepId: "delivery",
      stepIndex: LIFECYCLE_STEPS.length - 1,
      label: "已交付",
      isTerminal: true,
    };
  }
  const index = LIFECYCLE_STEPS.findIndex((step) => step.statuses.includes(status));
  const step = index >= 0 ? LIFECYCLE_STEPS[index]! : LIFECYCLE_STEPS[0]!;
  return {
    currentStepId: step.id,
    stepIndex: Math.max(index, 0),
    label: step.label,
    isTerminal: false,
  };
}

function normalizeAgentId(agentId: string): string {
  return agentId.split("@")[0] ?? agentId;
}

function buildAgentStates(projection: ConsoleProjection, runs: ReturnType<typeof adaptConsoleProjection>["runs"]): UiV3AgentState[] {
  const byAgent = new Map<string, (typeof runs)[number][]>();
  for (const run of runs) {
    const id = normalizeAgentId(run.agentId);
    const bucket = byAgent.get(id) ?? [];
    bucket.push(run);
    byAgent.set(id, bucket);
  }

  return AGENT_ROSTER.map((entry) => {
    const agentRuns = byAgent.get(entry.id) ?? [];
    const latest = [...agentRuns].sort((a, b) => b.lastSeq - a.lastSeq)[0];
    const status: AgentRunStatus = latest?.status ?? "pending";
    return {
      id: entry.id,
      name: entry.name,
      group: entry.group,
      role: entry.role,
      tier: entry.tier,
      status,
      latestSummary: latest?.summary,
      runCount: agentRuns.length,
      lastRunId: latest?.id,
    };
  });
}

function buildGateView(projection: ConsoleProjection, gate: SnapshotGate): UiV3GateView {
  const metadata = readGateMetadata(gate);
  const integrationLabel = formatIntegrationToolLabel(metadata);
  const presentation = getGatePresentation(gate.gateType);
  const openGate: OpenGate = {
    id: gate.id,
    type: gate.gateType,
    title: integrationLabel ?? presentation.title,
    description:
      formatIntegrationGateReason(metadata) ?? presentation.description,
    risk:
      (metadata as { riskLevel?: "low" | "medium" | "high" } | undefined)?.riskLevel ??
      (gate.gateType === "dangerous_operation" ? "high" : "medium"),
    command: integrationLabel ?? metadata?.toolName ?? "",
    options: gate.options.map((option, index) => ({
      id: option,
      label: option.replaceAll("_", " "),
      tone:
        option.includes("fail") || option.includes("reject")
          ? "danger"
          : index === 0
            ? "primary"
            : "secondary",
    })),
  };
  return {
    ...openGate,
    isBlocking: gate.id === projection.blockingGateId,
  };
}

function buildContextualActions(
  projection: ConsoleProjection,
  lifecycle: UiV3LifecycleState,
): UiV3ContextualAction[] {
  const status = projection.snapshot.project.status;
  const actions: UiV3ContextualAction[] = [];

  if (status === "PRD Ready" && projection.openGates.length === 0) {
    actions.push({
      id: "start-development",
      label: "开始开发",
      description: "PRD 已确认，启动技术方案与切片开发流程。",
      variant: "primary",
    });
  }

  if (status === "Testing") {
    actions.push({
      id: "deploy",
      label: "运行测试并部署",
      description: "执行最终测试套件，通过后进入部署确认。",
      variant: "primary",
    });
  }

  if (status === "Draft Requirement" && !projection.snapshot.requirement?.rawRequirement) {
    actions.push({
      id: "hint-requirement",
      label: "提交需求",
      description: "在下方输入一句话产品需求，开始需求澄清流程。",
      variant: "secondary",
      disabled: true,
      disabledReason: "请使用底部输入框提交需求",
    });
  }

  if (lifecycle.currentStepId === "paused") {
    actions.push({
      id: "resume",
      label: "恢复项目",
      description: projection.snapshot.pausedFrom
        ? `恢复后回到 ${projection.snapshot.pausedFrom}`
        : "继续执行工作流",
      variant: "primary",
    });
  }

  return actions;
}

export function adaptUiV3Projection(projection: ConsoleProjection): UiV3Projection {
  const base = adaptConsoleProjection(projection);
  const lifecycle = resolveLifecycle(
    projection.snapshot.project.status,
    projection.snapshot.pausedFrom,
  );
  const openGates = projection.openGates.map((gate) => buildGateView(projection, gate));
  const blockingGate = openGates.find((gate) => gate.isBlocking);
  const pendingQuestions =
    projection.snapshot.requirement?.pendingQuestions?.map((item, index) => ({
      index,
      question: item.question,
      suggestedAnswers: item.suggestedAnswers ?? [],
    })) ?? [];

  const dev = projection.snapshot.dev;
  const sliceProgress =
    dev?.sliceTotal != null
      ? {
          current: (dev.sliceIndex ?? 0) + 1,
          total: dev.sliceTotal,
          sliceId: dev.currentSliceId,
        }
      : undefined;

  return {
    base,
    lifecycle,
    agentStates: buildAgentStates(projection, base.runs),
    openGates,
    blockingGate,
    contextualActions: buildContextualActions(projection, lifecycle),
    pendingQuestions,
    sliceProgress,
    devPreviewUrl: projection.snapshot.dev?.previewUrl,
    testingPreviewUrl: projection.snapshot.testing?.previewUrl,
    rawProjection: projection,
  };
}
