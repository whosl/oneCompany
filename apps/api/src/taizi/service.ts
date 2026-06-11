import {
  answerTaiziWithTools,
  classifyTaiziMessage,
  getActiveHarnessSession,
  isStatusInquiry,
  registerTaiziAgent,
  steerHarnessSession,
} from "@oc/agent-core";
import {
  emit,
  type Db,
  type EventEnvelope,
  type TaiziContext,
  type TaiziDecision,
  type TaiziDispatchResult,
} from "@oc/shared";
import type { ChangeRequestService } from "../change-requests/service.js";
import type { ConsoleService } from "../console/service.js";
import type { DeliveryService } from "../delivery/service.js";
import type { DevelopmentService } from "../development/service.js";
import type { GateService } from "../gates/service.js";
import type { ProjectService } from "../projects/service.js";
import type { RequirementService } from "../requirement/service.js";
import type { TestingService } from "../testing/service.js";
import type { WorkspaceService } from "../workspace/service.js";

export type TaiziServiceDeps = {
  db: Db;
  projects: ProjectService;
  gates: GateService;
  workspace: WorkspaceService;
  requirement: RequirementService;
  development: DevelopmentService;
  testing: TestingService;
  delivery: DeliveryService;
  changeRequests: ChangeRequestService;
  consoleService: ConsoleService;
  onEvent: (envelope: EventEnvelope) => void;
};

/** 「继续」对各类门禁的默认放行选项。final_acceptance 故意缺席（需要用户明确表态）。 */
const CONTINUE_GATE_DECISION: Record<string, string> = {
  requirement_confirm: "approve",
  tech_plan_confirm: "approve",
  dangerous_operation: "approve",
  deployment: "approve",
  requirement_stuck: "force_continue",
  slice_failure: "retry",
  change_review: "update_plan",
};

export function createTaiziService(deps: TaiziServiceDeps) {
  registerTaiziAgent(deps.db);

  const buildContext = (projectId: string): TaiziContext => {
    const project = deps.projects.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    const openGates = deps.gates.listOpenGates(projectId).map((gate) => ({
      id: gate.id,
      gateType: gate.gateType,
      options: gate.options,
    }));
    let pendingQuestionCount = 0;
    try {
      const snapshot = deps.consoleService.getSnapshot(projectId);
      pendingQuestionCount = snapshot.requirement?.pendingQuestions?.length ?? 0;
    } catch {
      /* requirement session may not exist yet */
    }
    return {
      projectStatus: project.status,
      openGates,
      pendingQuestionCount,
      hasLiveSession: getActiveHarnessSession(projectId) !== undefined,
    };
  };

  const emitRouted = (
    projectId: string,
    message: string,
    result: TaiziDispatchResult,
  ): void => {
    const envelope = emit(deps.db, {
      projectId,
      agentId: "taizi",
      payload: {
        type: "taizi.routed",
        projectId,
        message,
        intent: result.intent,
        action: result.action,
        reply: result.reply,
        stateChanged: result.stateChanged,
      },
    });
    deps.onEvent(envelope);
  };

  /**
   * 长耗时工作流（需求/开发/测试/门禁恢复）不能阻塞 Taizi 应答：
   * 后台执行，失败时补发一条 taizi.routed 事件告知用户。
   */
  const runInBackground = (projectId: string, message: string, action: string, fn: () => Promise<unknown>): void => {
    void fn().catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error);
      emitRouted(projectId, message, {
        intent: "chat",
        action: `${action}.failed`,
        reply: `执行「${action}」失败：${detail.slice(0, 200)}`,
        stateChanged: false,
      });
    });
  };

  const nextStepHint = (context: TaiziContext): string => {
    const gate = context.openGates[0];
    if (gate?.gateType === "change_review") {
      return `下一步：对变更评审回复「继续」或「批准」放行（${gate.options.join("/")}），或「拒绝」撤销。`;
    }
    if (gate) {
      return `下一步：对「${gate.gateType}」门禁表态（可选：${gate.options.join(" / ")}），或直接说「批准」「继续」。`;
    }
    switch (context.projectStatus) {
      case "Draft Requirement":
        return "下一步：描述产品需求，或输入面试助手等示例需求。";
      case "Asking Questions":
        return "下一步：在问题卡片逐题回答，或说「跳过」用默认假设生成 PRD。";
      case "PRD Ready":
        return "下一步：说「开始开发」或按 d 启动开发。";
      case "Developing":
        return context.hasLiveSession
          ? "下一步：编码 Agent 正在工作，可说「停」打断，或「加一个xxx」插话。"
          : "下一步：说「继续」续跑当前切片。";
      case "Change Review":
        return "下一步：说「继续」按原计划开发，或「拒绝」撤销变更。";
      case "Testing":
        return "下一步：说「继续」跑全量测试。";
      case "Awaiting Acceptance":
        return "下一步：明确回复「接受验收」或「拒绝重做」。";
      case "Paused":
        return "下一步：说「继续」恢复项目。";
      default:
        return "";
    }
  };

  const buildResearchExecCtx = (projectId: string) => {
    const project = deps.projects.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    const paths = deps.workspace.ensureForProject(project);
    return {
      db: deps.db,
      projectId,
      repoPath: paths.repo,
      logsPath: paths.logs,
      onEvent: deps.onEvent,
      authorize: async (op: { kind: string }) =>
        op.kind === "read" ? ({ allow: true as const }) : ({ allow: false as const, reason: "Taizi 仅允许只读操作" }),
    };
  };

  const researchAndReply = async (
    projectId: string,
    message: string,
    context: TaiziContext,
    decision: TaiziDecision,
  ): Promise<string> => {
    const fallback = summarizeStatus(projectId, context);
    return answerTaiziWithTools({
      message,
      context,
      execCtx: buildResearchExecCtx(projectId),
      fallbackReply: fallback,
    });
  };

  const summarizeStatus = (projectId: string, context: TaiziContext): string => {
    const parts: string[] = [`项目状态：${context.projectStatus}`];
    try {
      const snapshot = deps.consoleService.getSnapshot(projectId);
      if (snapshot.requirement) {
        const score = snapshot.requirement.completenessScore;
        const pct = score <= 1 ? Math.round(score * 100) : Math.round(score);
        parts.push(`需求完整度 ${pct}%`);
      }
      if (snapshot.dev?.currentSliceId) {
        parts.push(`当前切片 ${snapshot.dev.currentSliceId}`);
      }
      if (snapshot.project.createdAt) {
        const started = new Date(snapshot.project.createdAt).getTime();
        const mins = Math.max(0, Math.round((Date.now() - started) / 60_000));
        parts.push(`已运行约 ${mins} 分钟`);
      }
    } catch {
      /* snapshot best-effort */
    }
    if (context.openGates.length > 0) {
      parts.push(
        `待确认门禁：${context.openGates.map((gate) => gate.gateType).join("、")}`,
      );
    }
    if (context.pendingQuestionCount > 0) {
      parts.push(`待回答澄清问题 ${context.pendingQuestionCount} 个`);
    }
    const hint = nextStepHint(context);
    if (hint) parts.push(hint);
    return parts.join("；");
  };

  /** 门禁必须同步完成后再回复用户，避免「已放行」但 Gate 仍 open 的错觉。 */
  const resolveGateNow = async (
    projectId: string,
    message: string,
    gateId: string,
    decision: string,
    gateType: string,
  ): Promise<TaiziDispatchResult> => {
    try {
      await deps.gates.resolveGate(gateId, { decision });
      return {
        intent: "gate_decision",
        action: `gate.${decision}`,
        reply: `已对「${gateType}」选择 ${decision}，工作流继续。`,
        stateChanged: true,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        intent: "chat",
        action: "gate.resolve.failed",
        reply: `门禁处理失败：${detail.slice(0, 200)}`,
        stateChanged: false,
      };
    }
  };

  /** 把 Taizi 决策落到具体动作。覆盖所有项目状态 × 意图组合。 */
  const dispatch = async (
    projectId: string,
    message: string,
    decision: TaiziDecision,
    context: TaiziContext,
  ): Promise<TaiziDispatchResult> => {
    const status = context.projectStatus;
    const firstGate = context.openGates[0];
    const text = decision.payload?.trim() || message.trim();

    switch (decision.intent) {
      case "continue": {
        if (status === "Paused") {
          deps.projects.resumeProject(projectId);
          return {
            intent: "continue",
            action: "project.resume",
            reply: "已恢复项目，回到暂停前的阶段。",
            stateChanged: true,
          };
        }
        if (firstGate) {
          const gateDecision = CONTINUE_GATE_DECISION[firstGate.gateType];
          if (gateDecision && firstGate.options.includes(gateDecision)) {
            return resolveGateNow(
              projectId,
              message,
              firstGate.id,
              gateDecision,
              firstGate.gateType,
            );
          }
          return {
            intent: "continue",
            action: "noop",
            reply: `「${firstGate.gateType}」门禁需要你明确表态（可选：${firstGate.options.join(" / ")}）。`,
            stateChanged: false,
          };
        }
        if (status === "Asking Questions" || context.pendingQuestionCount > 0) {
          runInBackground(projectId, message, "requirement.skip", () =>
            deps.requirement.skipClarification(projectId),
          );
          return {
            intent: "continue",
            action: "requirement.skip",
            reply: "跳过剩余澄清问题，用默认假设继续生成 PRD。",
            stateChanged: true,
          };
        }
        if (status === "PRD Ready") {
          runInBackground(projectId, message, "development.start", () =>
            deps.development.start(projectId),
          );
          return {
            intent: "continue",
            action: "development.start",
            reply: "PRD 已就绪，启动开发流程。",
            stateChanged: true,
          };
        }
        if (status === "Developing") {
          if (context.hasLiveSession) {
            return {
              intent: "continue",
              action: "noop",
              reply: "编码 Agent 正在工作中，无需干预。",
              stateChanged: false,
            };
          }
          runInBackground(projectId, message, "development.start", () =>
            deps.development.start(projectId),
          );
          return {
            intent: "continue",
            action: "development.start",
            reply: "续跑开发切片。",
            stateChanged: true,
          };
        }
        if (status === "Testing") {
          runInBackground(projectId, message, "testing.start", () =>
            deps.testing.start(projectId, { requestDeploy: true }),
          );
          return {
            intent: "continue",
            action: "testing.start",
            reply: "启动测试（含部署确认）。",
            stateChanged: true,
          };
        }
        if (status === "Awaiting Acceptance") {
          return {
            intent: "continue",
            action: "noop",
            reply: "项目等待最终验收。明确回复「接受验收」或「拒绝重做」。",
            stateChanged: false,
          };
        }
        if (status === "Draft Requirement") {
          return {
            intent: "continue",
            action: "noop",
            reply: "还没有需求。先描述一下你要做什么产品。",
            stateChanged: false,
          };
        }
        return {
          intent: "continue",
          action: "noop",
          reply: `当前状态「${status}」由工作流自动推进，无需手动继续。`,
          stateChanged: false,
        };
      }

      case "pause": {
        if (status === "Paused") {
          return { intent: "pause", action: "noop", reply: "项目已处于暂停状态。", stateChanged: false };
        }
        if (status === "Delivered" || status === "Failed") {
          return {
            intent: "pause",
            action: "noop",
            reply: `项目已${status === "Delivered" ? "交付" : "失败"}，无需暂停。`,
            stateChanged: false,
          };
        }
        deps.projects.pauseProject(projectId);
        return { intent: "pause", action: "project.pause", reply: "已暂停项目，说「继续」即可恢复。", stateChanged: true };
      }

      case "stop": {
        if (context.hasLiveSession) {
          const delivered = await steerHarnessSession(
            projectId,
            "用户要求立即停止当前操作。请停止手头工作，等待用户的下一步指示。",
            { abort: true },
          );
          if (delivered) {
            return {
              intent: "stop",
              action: "session.abort",
              reply: "已打断当前操作，Agent 在等你的下一步指示。",
              stateChanged: true,
            };
          }
        }
        if (status !== "Paused" && status !== "Delivered" && status !== "Failed") {
          deps.projects.pauseProject(projectId);
          return {
            intent: "stop",
            action: "project.pause",
            reply: "当前没有正在执行的操作，已暂停项目。",
            stateChanged: true,
          };
        }
        return { intent: "stop", action: "noop", reply: "当前没有可停止的工作。", stateChanged: false };
      }

      case "new_requirement": {
        if (status === "Draft Requirement") {
          runInBackground(projectId, message, "requirement.start", () =>
            deps.requirement.start(projectId, text),
          );
          return {
            intent: "new_requirement",
            action: "requirement.start",
            reply: "需求已收到，需求录入 Agent 开始分析。",
            stateChanged: true,
          };
        }
        if (status === "Developing" || status === "Testing") {
          // 项目已在开发——新「需求」按变更请求处理。
          return dispatch(projectId, message, { ...decision, intent: "change_request" }, context);
        }
        return {
          intent: "new_requirement",
          action: "noop",
          reply: `当前状态「${status}」不能直接录入新需求；开发中可以用「加一个xxx功能」提变更。`,
          stateChanged: false,
        };
      }

      case "answer_question": {
        if (context.pendingQuestionCount > 0) {
          return {
            intent: "answer_question",
            action: "noop",
            reply: "请在问题卡片中逐题回答（可用 ←→ 切换），或说「跳过」用默认假设。",
            stateChanged: false,
          };
        }
        return {
          intent: "answer_question",
          action: "noop",
          reply: "当前没有待回答的澄清问题。",
          stateChanged: false,
        };
      }

      case "skip_clarification": {
        if (status === "Asking Questions" || context.pendingQuestionCount > 0) {
          runInBackground(projectId, message, "requirement.skip", () =>
            deps.requirement.skipClarification(projectId),
          );
          return {
            intent: "skip_clarification",
            action: "requirement.skip",
            reply: "已跳过澄清，用默认假设生成 PRD。",
            stateChanged: true,
          };
        }
        return {
          intent: "skip_clarification",
          action: "noop",
          reply: "当前不在澄清阶段，没有可跳过的问题。",
          stateChanged: false,
        };
      }

      case "gate_decision": {
        const gate = decision.gateId
          ? context.openGates.find((item) => item.id === decision.gateId)
          : firstGate;
        if (!gate) {
          return { intent: "gate_decision", action: "noop", reply: "当前没有打开的门禁。", stateChanged: false };
        }
        const gateDecision = decision.gateDecision;
        if (!gateDecision || !gate.options.includes(gateDecision)) {
          return {
            intent: "gate_decision",
            action: "noop",
            reply: `「${gate.gateType}」门禁可选：${gate.options.join(" / ")}，请明确选择。`,
            stateChanged: false,
          };
        }
        return resolveGateNow(projectId, message, gate.id, gateDecision, gate.gateType);
      }

      case "change_request": {
        if (isStatusInquiry(message)) {
          const reply = await researchAndReply(projectId, message, context, {
            ...decision,
            intent: "status_query",
            reply: "",
          });
          return {
            intent: "status_query",
            action: "taizi.research",
            reply,
            stateChanged: false,
          };
        }
        // 优先插话给活跃编码会话（Claude-Code 式 steering）。
        if (context.hasLiveSession) {
          const delivered = await steerHarnessSession(projectId, text, {
            abort: decision.abort === true,
          });
          if (delivered) {
            return {
              intent: "change_request",
              action: decision.abort ? "session.interrupt" : "session.steer",
              reply: decision.abort
                ? "已打断当前操作，新指示已送达 Agent。"
                : "已插话，Agent 下一步会采纳这条信息。",
              stateChanged: true,
            };
          }
        }
        if (status === "Developing" || status === "Testing") {
          runInBackground(projectId, message, "change_request.create", async () =>
            deps.changeRequests.create(projectId, { summary: text }),
          );
          return {
            intent: "change_request",
            action: "change_request.create",
            reply: "没有正在工作的 Agent，已转为正式变更请求进入评审。",
            stateChanged: true,
          };
        }
        if (status === "Draft Requirement") {
          return dispatch(projectId, message, { ...decision, intent: "new_requirement" }, context);
        }
        if (status === "Asking Questions") {
          return {
            intent: "change_request",
            action: "noop",
            reply: "需求澄清进行中——把这条补充写进当前问题的回答里，或说「跳过」后在 PRD 评审时提出。",
            stateChanged: false,
          };
        }
        return {
          intent: "change_request",
          action: "noop",
          reply: `当前状态「${status}」暂不支持变更请求（支持阶段：开发中 / 测试中）。`,
          stateChanged: false,
        };
      }

      case "start_development": {
        const requirementGate = context.openGates.find(
          (gate) => gate.gateType === "requirement_confirm",
        );
        if (requirementGate) {
          return {
            intent: "start_development",
            action: "noop",
            reply: "需求确认门禁还开着，先回复「批准」放行后才能启动开发。",
            stateChanged: false,
          };
        }
        if (status === "PRD Ready" || status === "Developing") {
          runInBackground(projectId, message, "development.start", () =>
            deps.development.start(projectId),
          );
          return {
            intent: "start_development",
            action: "development.start",
            reply: status === "PRD Ready" ? "启动开发流程。" : "续跑开发切片。",
            stateChanged: true,
          };
        }
        return {
          intent: "start_development",
          action: "noop",
          reply: `当前状态「${status}」不能启动开发（需要 PRD Ready）。`,
          stateChanged: false,
        };
      }

      case "start_testing": {
        if (status === "Testing" || status === "Developing") {
          runInBackground(projectId, message, "testing.start", () =>
            deps.testing.start(projectId, { requestDeploy: true }),
          );
          return {
            intent: "start_testing",
            action: "testing.start",
            reply: "启动测试流程。",
            stateChanged: true,
          };
        }
        return {
          intent: "start_testing",
          action: "noop",
          reply: `当前状态「${status}」不能启动测试。`,
          stateChanged: false,
        };
      }

      case "export_submission": {
        const result = deps.delivery.exportSubmission(projectId);
        return {
          intent: "export_submission",
          action: "delivery.export",
          reply: `提交包已导出：${result.packagePath}`,
          stateChanged: true,
        };
      }

      case "status_query": {
        const reply = await researchAndReply(projectId, message, context, decision);
        return {
          intent: "status_query",
          action: "taizi.research",
          reply,
          stateChanged: false,
        };
      }

      case "chat":
      default: {
        const reply = await researchAndReply(projectId, message, context, {
          ...decision,
          reply:
            decision.reply ||
            "我不确定你想做什么。可以说「继续」「暂停」「加一个xxx功能」「导出提交包」或「现在到哪了」。",
        });
        return {
          intent: "chat",
          action: "taizi.research",
          reply,
          stateChanged: false,
        };
      }
    }
  };

  return {
    async handleMessage(projectId: string, message: string): Promise<TaiziDispatchResult> {
      const trimmed = message.trim();
      if (!trimmed) {
        throw new Error("message is required");
      }
      const context = buildContext(projectId);
      let decision = await classifyTaiziMessage({ message: trimmed, context });
      // 进度/下一步类问句绝不创建变更单（用户直觉：在问状态，不是在改需求）。
      if (decision.intent === "change_request" && isStatusInquiry(trimmed)) {
        decision = { ...decision, intent: "status_query", reply: "" };
      }
      const result = await dispatch(projectId, trimmed, decision, context);
      emitRouted(projectId, trimmed, result);
      return result;
    },
  };
}

export type TaiziService = ReturnType<typeof createTaiziService>;
