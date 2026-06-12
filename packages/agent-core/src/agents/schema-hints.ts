import { REQUIREMENT_AGENT_IDS } from "./requirement/definitions.js";
import { DEVELOPMENT_AGENT_IDS } from "./development/definitions.js";

const REQUIREMENT_SCHEMA_HINTS: Record<string, string> = {
  [REQUIREMENT_AGENT_IDS.intake]: `{
  "normalizedSummary": "string — 简洁规范的需求概述（中文）",
  "targetUsers": ["string — 目标用户"],
  "userGoals": ["string — 用户目标"],
  "appType": "string — 默认 web；仅当用户明确只要 CLI/API 库时用 cli 或 api",
  "missingContext": ["string — 仍需澄清的疑点"]
}`,
  [REQUIREMENT_AGENT_IDS.analyst]: `{
  "coreFeatures": ["string — 核心功能"],
  "pagesAndFlows": [{ "name": "string — 浏览器页面名", "purpose": "string", "userActions": ["string — 页面上可执行操作"] }],
  "dataObjects": [{ "name": "string", "fields": ["string"], "relationships": ["string"] }],
  "rolesAndPermissions": ["string — 角色与权限"],
  "integrations": ["string — 外部集成"],
  "nonFunctionalRequirements": ["string — 非功能需求"],
  "assumptions": ["string — 假设"]
}`,
  [REQUIREMENT_AGENT_IDS.scorer]: `{
  "completenessScore": 0,
  "gaps": [{ "topic": "string — 业务缺口主题（技术实现细节不算缺口）", "severity": "low|medium|critical", "question": "string" }]
}`,
  [REQUIREMENT_AGENT_IDS.questionPlanner]: `{
  "topic": "string — 本轮聚焦的业务主题",
  "questions": [{
    "question": "string — 一个聚焦业务的问题（不要问技术实现，用通俗的业务语言）",
    "suggestedAnswers": ["string — 具体可选的建议答案 A", "string — 建议答案 B", "string — 建议答案 C"]
  }]
}
每轮提出 3 到 6 个问题，覆盖不同的缺口主题；每个问题必须给出可直接选用的建议答案。`,
  [REQUIREMENT_AGENT_IDS.prdAcceptance]: `{
  "prd": "string — markdown 格式的 PRD 正文（中文），须含页面/流程说明",
  "acceptanceCriteria": "string — markdown 列表；至少一半条目描述浏览器中可见/可操作的 UI 行为",
  "assumptions": ["string — 假设"],
  "risks": ["string — 风险"]
}`,
};

const DEVELOPMENT_SCHEMA_HINTS: Record<string, string> = {
  [DEVELOPMENT_AGENT_IDS.architect]: `{
  "techPlan": "string — markdown 技术方案（中文），须含 Web 前端层、页面结构、dev/preview 启动方式",
  "stack": ["string — 须含前端与 dev 服务器相关技术"],
  "architectureNotes": ["string — 含前后端/UI 分层说明"],
  "risks": ["string — 风险"]
}`,
  [DEVELOPMENT_AGENT_IDS.planner]: `{
  "slices": [{
    "id": "string",
    "title": "string — 切片标题（中文）",
    "description": "string — 切片说明（中文）",
    "acceptanceChecks": ["string — 至少一条描述浏览器 UI 行为"],
    "testCommand": "string — 例如 pnpm vitest run tests/slice1.test.ts --reporter=json",
    "expectedFiles": ["string — 规划提示（须与技术方案目录一致，含 Web/UI 路径）；权威验收以 vitest + Web UI 为准"]
  }],
  "planningNotes": ["string — 规划说明"]
}`,
  [DEVELOPMENT_AGENT_IDS.coding]: `{
  "summary": "string — 改动摘要（中文）",
  "changedFiles": ["string"],
  "testsAdded": ["string"]
}`,
  [DEVELOPMENT_AGENT_IDS.review]: `{
  "approved": true,
  "findings": ["string — 审查发现（中文）"],
  "summary": "string — 审查结论（中文）"
}`,
  [DEVELOPMENT_AGENT_IDS.qa]: `{
  "passed": true,
  "notes": ["string — 验证记录，使用集成工具时引用其结果（中文）"],
  "coverageSummary": "string — 覆盖情况摘要"
}`,
  [DEVELOPMENT_AGENT_IDS.devopsDelivery]: `{
  "artifacts": ["string"],
  "deploymentNotes": "string — 部署说明（中文），含 pnpm dev 与浏览器访问方式",
  "previewHints": ["string — 提示用户在浏览器打开 Preview 并验证关键页面"]
}`,
};

const REASONING_HINT = `同一个 JSON 对象中还必须包含以下字符串字段（全部用简体中文撰写）：
  "plan": "向用户展示的简短计划",
  "observation": "从输入中观察到的要点",
  "reflection": "对本次结果的简短反思"`;

export function outputSchemaHint(agentIdAtVersion: string): string {
  const hint =
    REQUIREMENT_SCHEMA_HINTS[agentIdAtVersion] ?? DEVELOPMENT_SCHEMA_HINTS[agentIdAtVersion];
  if (!hint) {
    return ["严格按照该 agent 的输出 schema 返回，只使用要求的顶层字段。", REASONING_HINT].join(
      "\n",
    );
  }
  return [
    "严格返回一个 JSON 对象，仅包含以下顶层字段与结构（不要包裹任何其他键）：",
    hint,
    REASONING_HINT,
  ].join("\n");
}
