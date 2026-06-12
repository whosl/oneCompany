import type { Db } from "@oc/shared";
import { getAgent } from "../registry.js";
import type { ReviewSpec, SliceSpec } from "../harness/types.js";
import { DEVELOPMENT_AGENT_IDS } from "./development/definitions.js";
import { REQUIREMENT_AGENT_IDS } from "./requirement/definitions.js";
import { outputSchemaHint } from "./schema-hints.js";
import {
  WEB_DELIVERY_POLICY,
  WEB_DEPLOYMENT_GUIDANCE,
  WEB_DEVELOPMENT_GUIDANCE,
  WEB_REQUIREMENT_GUIDANCE,
} from "./web-delivery-policy.js";

export type AgentPromptContent = {
  system?: string;
  human?: string;
  /** OpenCode harness uses a single plain-text prompt. */
  text?: string;
  sliceId?: string;
};

/** Per-agent working instructions (Chinese), appended to the system prompt. */
const AGENT_GUIDANCE: Record<string, string> = {
  [REQUIREMENT_AGENT_IDS.intake]: [
    "你的任务：把用户的原始输入整理成一段简洁、规范的需求概述，识别目标用户、用户目标和应用类型，并列出仍需澄清的疑点。",
    WEB_DELIVERY_POLICY,
    "除非用户明确要求纯 CLI/API 库，否则 appType 一律设为 web。",
  ].join("\n"),
  [REQUIREMENT_AGENT_IDS.analyst]: [
    "你的任务：从需求中提取结构化信息——核心功能、页面与流程、数据对象、角色与权限、外部集成、非功能需求；信息不足处给出合理假设并明确标注。",
    WEB_REQUIREMENT_GUIDANCE,
    "pagesAndFlows 必须列出用户可在浏览器中访问的页面，每个页面说明用途与可执行操作。",
  ].join("\n"),
  [REQUIREMENT_AGENT_IDS.scorer]:
    "你的任务：评估需求完整度（0-100）并列出缺口。注意：技术实现细节（技术栈、框架、协议、库等）不算缺口，可由团队按最佳实践决定；只有影响业务理解、功能范围和验收标准的缺失才算缺口。",
  [REQUIREMENT_AGENT_IDS.questionPlanner]: [
    "你的任务：规划向用户提出的澄清问题。要求：",
    "1. 只问业务层面的问题：目标用户与使用场景、核心业务流程、角色与权限、关键数据与状态流转、边界情况、验收期望、范围与优先级取舍。",
    "2. 不要向用户提技术实现问题（技术栈、框架、协议、第三方库、部署方式等）——这些由团队按行业最佳实践自行决定；如确有技术取舍影响业务，直接在建议答案中给出推荐默认值。",
    "3. 每个问题提供 2-4 个具体、可直接选用的建议答案。",
    "4. 问题要少而精，每轮不超过 3 个；使用通俗的业务语言，避免技术术语。",
  ].join("\n"),
  [REQUIREMENT_AGENT_IDS.prdAcceptance]: [
    "你的任务：基于已确认的需求撰写 PRD 与验收标准，明确假设与风险；验收标准要可逐条验证。",
    WEB_REQUIREMENT_GUIDANCE,
    "验收标准中至少一半条目须描述用户在浏览器中可见或可操作的 UI 行为。",
  ].join("\n"),
  [DEVELOPMENT_AGENT_IDS.architect]: [
    "你的任务：产出技术方案——技术栈选型、架构说明与风险；方案需可被后续功能切片直接执行。",
    WEB_DELIVERY_POLICY,
    WEB_DEVELOPMENT_GUIDANCE,
    "技术方案必须包含 Web 前端层（页面结构、路由/导航、dev 启动方式），默认 TypeScript + 静态/SPA 前端 + dev 脚本。",
  ].join("\n"),
  [DEVELOPMENT_AGENT_IDS.planner]: [
    "你的任务：把验收标准拆分为有序的功能切片，每个切片可独立实现、独立验证；同时为每个切片设计可执行、范围清晰的 vitest 测试。",
    "生成项目使用 TypeScript + vitest 脚手架（已有 vitest.config.ts），testCommand 必须使用 vitest，",
    "格式如：pnpm vitest run tests/slice1.test.ts --reporter=json。禁止输出 pytest/python 命令。",
    "若切片包含 UI 页面，测试说明中须提及页面/组件可渲染或 DOM 可访问（可配合 vitest + jsdom 或 Playwright）。",
    WEB_DELIVERY_POLICY,
    WEB_DEVELOPMENT_GUIDANCE,
    "第一个切片必须交付 Web 应用壳（index.html + dev 脚本 + 至少一个业务页面），禁止首个切片只做无 UI 的后端/service 层。",
    "每个切片的 expectedFiles 建议与技术方案目录一致（例如 tech plan 写 src/ 则列 src/app.ts，写 public/ 则列 public/game.js）；仅为规划提示，不单独作为验收门槛。",
    "权威验收以 vitest 通过 + 真实 Web UI 为准。",
    "切片粒度要求（每个切片都有固定开销：编码会话冷启动 + 测试 + 审查，约 5-8 分钟）：",
    "1. 优先合并：会改动同一批文件、或彼此强依赖的验收点必须合并为一个切片。",
    "2. 小型项目（单页应用、小游戏、工具类）控制在 2-3 个切片；中型项目不超过 5 个。",
    "3. 每个切片应是一个对用户有意义的功能增量，而不是一个文件或一个函数。",
    "4. 只有当两个验收点可以完全独立交付和验证时才拆开。",
  ].join("\n"),
  [DEVELOPMENT_AGENT_IDS.coding]: [
    "你的任务：实现指定的功能切片，做最小必要修改，保证对应测试通过。",
    WEB_DELIVERY_POLICY,
    WEB_DEVELOPMENT_GUIDANCE,
    "必须创建或更新 Web 页面（HTML/前端组件），让用户在浏览器 Preview 中看到本切片功能；禁止仅提交 src/services 下的纯逻辑而无 UI。",
  ].join("\n"),
  [DEVELOPMENT_AGENT_IDS.review]: [
    "你的任务：审查切片改动——正确性、与验收标准的一致性、明显缺陷与风险。",
    WEB_DEVELOPMENT_GUIDANCE,
    "若切片应交付 UI 但 index.html 仍为 scaffold 占位页 generated-app，必须拒绝（approved: false）。",
    "expectedFiles 路径若与技术方案或实际实现不一致，仅作 findings 提醒，不得单独因此拒绝；以 vitest 与真实 Web UI 为准。",
  ].join("\n"),
  [DEVELOPMENT_AGENT_IDS.qa]: [
    "你的任务：验证预览质量；可调用受管控的集成工具，结论需引用工具结果。",
    WEB_DELIVERY_POLICY,
    "Preview URL 必须展示真实产品界面；若页面标题仍为 generated-app 占位页，判定为未通过（passed: false）。",
  ].join("\n"),
  [DEVELOPMENT_AGENT_IDS.devopsDelivery]: [
    "你的任务：汇总交付产物并撰写交付说明。",
    WEB_DELIVERY_POLICY,
    WEB_DEPLOYMENT_GUIDANCE,
  ].join("\n"),
};

export function buildAgentSystemPrompt(db: Db, agentIdAtVersion: string): string {
  const agent = getAgent(db, agentIdAtVersion);
  return [
    `你是 OneCompany 软件交付流水线中的「${agent.role}」。`,
    agent.description,
    AGENT_GUIDANCE[agentIdAtVersion] ?? "",
    "所有面向用户的文本（plan、observation、reflection、问题、总结等）一律使用简体中文。",
    "在给出最终答案之前，可以调用已注册的工具。",
    "最终回答必须且只能是一个 JSON 对象。",
    "除任务输出字段外，同一 JSON 对象中还需包含 plan、observation、reflection 三个字符串字段。",
    outputSchemaHint(agentIdAtVersion),
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildStructuredAgentPrompts(
  db: Db,
  agentIdAtVersion: string,
  userPayload: unknown,
): Pick<AgentPromptContent, "system" | "human"> {
  const human =
    typeof userPayload === "string" ? userPayload : JSON.stringify(userPayload);
  return {
    system: buildAgentSystemPrompt(db, agentIdAtVersion),
    human,
  };
}

export function buildTddPrompt(slice: SliceSpec): string {
  const checks =
    slice.acceptanceChecks.length > 0
      ? slice.acceptanceChecks.map((check, index) => `${index + 1}. ${check}`).join("\n")
      : "";
  const deliverables =
    slice.expectedFiles && slice.expectedFiles.length > 0
      ? slice.expectedFiles.map((file, index) => `${index + 1}. ${file}`).join("\n")
      : "";

  return [
    `Implement slice "${slice.sliceId}" using strict TDD.`,
    `Goal: ${slice.goal}`,
    checks ? `Acceptance checks:\n${checks}` : "",
    deliverables
      ? `Target deliverable files (planning hints — create at these paths when feasible; align with tech plan):\n${deliverables}`
      : "",
    `Scoped test command (OneCompany runs this authoritatively after you finish): ${slice.testCommand}`,
    "Authoritative pass criteria: scoped vitest command exits success AND a real Web UI is present (not the generated-app placeholder).",
    "expectedFiles are advisory hints only; vitest pass + real Web UI are authoritative.",
    WEB_DELIVERY_POLICY,
    WEB_DEVELOPMENT_GUIDANCE,
    "The repo already contains package.json, tsconfig.json, vitest.config.ts, index.html scaffold, and src/.",
    "Create and edit files at paths indicated in Target deliverable files and the tech plan (src/, public/, index.html, etc.) using tools. Do not reply with text-only plans.",
    "You MUST deliver browser UI: create or update index.html and/or frontend assets with data-testid markers (app-shell, app-page, app-title).",
    'Replace the scaffold placeholder title "generated-app" with the real product name when this slice introduces UI.',
    "Add or wire a dev script if missing; Preview uses `pnpm dev` when available.",
    "Do not run npm/pnpm install; vitest is already available from the workspace toolchain.",
    "Write failing tests first, implement code, run the scoped test command via shell tools, then stop.",
    "Do not claim success without producing file changes and running the scoped test command.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildReviewPrompt(review: ReviewSpec): string {
  const checks =
    review.acceptanceChecks.length > 0
      ? review.acceptanceChecks.map((check, index) => `${index + 1}. ${check}`).join("\n")
      : "";
  const expectedFiles =
    review.expectedFiles && review.expectedFiles.length > 0
      ? review.expectedFiles.map((file, index) => `${index + 1}. ${file}`).join("\n")
      : "";

  return [
    `You are a READ-ONLY code reviewer for slice "${review.sliceId}" (just committed).`,
    `Slice goal: ${review.goal}`,
    checks ? `Acceptance checks:\n${checks}` : "",
    expectedFiles
      ? `Expected deliverable files (planning hints only — vitest pass + real Web UI are authoritative):\n${expectedFiles}`
      : "",
    review.diffSummary ? `Latest commit summary: ${review.diffSummary}` : "",
    "Inspect the repository using read / grep / glob tools ONLY.",
    "Do NOT edit, write, or create any files. Do NOT run shell commands.",
    "Review the implementation for correctness, consistency with the acceptance checks, and obvious defects.",
    "Reject if the slice should deliver UI but index.html is still the generated-app scaffold placeholder without product pages.",
    "If expectedFiles paths differ from implementation but vitest passes and real UI is present, note in findings but do not reject solely for path mismatch.",
    "When done, reply with EXACTLY ONE JSON object and nothing else:",
    '{"approved": true|false, "findings": ["发现1", "发现2"], "summary": "一句话结论"}',
    "findings 与 summary 必须使用简体中文。无问题时 findings 为空数组。",
  ]
    .filter(Boolean)
    .join("\n\n");
}
