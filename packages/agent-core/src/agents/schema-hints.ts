import { REQUIREMENT_AGENT_IDS } from "./requirement/definitions.js";
import { DEVELOPMENT_AGENT_IDS } from "./development/definitions.js";

const REQUIREMENT_SCHEMA_HINTS: Record<string, string> = {
  [REQUIREMENT_AGENT_IDS.intake]: `{
  "normalizedSummary": "string — 简洁规范的需求概述（中文）",
  "targetUsers": ["string — 目标用户"],
  "userGoals": ["string — 用户目标"],
  "appType": "string — 例如 cli、web、api",
  "missingContext": ["string — 仍需澄清的疑点"]
}`,
  [REQUIREMENT_AGENT_IDS.analyst]: `{
  "coreFeatures": ["string — 核心功能"],
  "pagesAndFlows": [{ "name": "string", "purpose": "string", "userActions": ["string"] }],
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
}`,
  [REQUIREMENT_AGENT_IDS.prdAcceptance]: `{
  "prd": "string — markdown 格式的 PRD 正文（中文）",
  "acceptanceCriteria": "string — markdown 列表形式的验收标准",
  "assumptions": ["string — 假设"],
  "risks": ["string — 风险"]
}`,
};

const DEVELOPMENT_SCHEMA_HINTS: Record<string, string> = {
  [DEVELOPMENT_AGENT_IDS.architect]: `{
  "techPlan": "string — markdown 格式的技术方案（中文）",
  "stack": ["string — 技术栈"],
  "architectureNotes": ["string — 架构说明"],
  "risks": ["string — 风险"]
}`,
  [DEVELOPMENT_AGENT_IDS.testDesigner]: `{
  "testSpecs": [{ "sliceId": "string", "testCommand": "string", "description": "string — 测试说明（中文）" }]
}`,
  [DEVELOPMENT_AGENT_IDS.planner]: `{
  "slices": [{
    "id": "string",
    "title": "string — 切片标题（中文）",
    "description": "string — 切片说明（中文）",
    "acceptanceChecks": ["string — 验收检查项"],
    "testCommand": "string — 例如 pnpm vitest run src/slice.test.ts --reporter=json",
    "expectedFiles": ["string"]
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
  "deploymentNotes": "string — 部署说明（中文）",
  "previewHints": ["string — 预览提示"]
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
