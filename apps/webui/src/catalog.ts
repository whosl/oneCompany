import type { AgentGroup } from "./types";

export type AgentCatalogEntry = {
  id: string;
  name: string;
  role: string;
  description: string;
  group: AgentGroup;
  capabilities: string[];
};

export const AGENTS: AgentCatalogEntry[] = [
  { id: "intake", name: "Intake", role: "需求录入 / 规范化", description: "把用户的原始输入整理成规范、可用的需求概述。", group: "requirement", capabilities: ["LLM 结构化输出", "需求规范化"] },
  { id: "requirement-analyst", name: "Requirement Analyst", role: "需求解析 / 结构化", description: "提取结构化需求：用户、数据对象、流程与约束。", group: "requirement", capabilities: ["LLM 结构化输出", "读取历史需求上下文"] },
  { id: "completeness-scorer", name: "Completeness Scorer", role: "完整度评分", description: "评估需求完整度，决定是否继续提问。", group: "requirement", capabilities: ["完整度阈值判定"] },
  { id: "question-planner", name: "Question Planner", role: "澄清问题规划", description: "规划聚焦业务的澄清问题，技术细节按最佳实践自行推荐。", group: "requirement", capabilities: ["业务导向提问策略"] },
  { id: "prd-acceptance", name: "PRD & Acceptance", role: "PRD / 验收标准", description: "基于确认的需求产出 PRD 与验收标准。", group: "requirement", capabilities: ["产物: PRD / 验收标准"] },
  { id: "taizi", name: "太子", role: "调度 / 问答", description: "接收自由输入，路由工作流动作；信息类问题调用只读工具调研后作答。", group: "requirement", capabilities: ["意图分类", "只读工具调研", "工作流调度"] },
  { id: "architect", name: "Architect", role: "技术方案 / 架构", description: "产出技术方案，供技术方案 Gate 审核。", group: "development", capabilities: ["产物: 技术方案", "读取工作区"] },
  { id: "planner", name: "Planner", role: "切片规划 / 测试设计", description: "把验收标准拆分为有序功能切片并设计测试。", group: "development", capabilities: ["切片拆分与排序", "测试设计"] },
  { id: "coding", name: "Coding", role: "代码生成 / 文件编辑", description: "逐个实现功能切片，使用 OpenCode Harness 执行。", group: "development", capabilities: ["OpenCode Harness", "bash / read / write / edit", "TDD 切片实现"] },
  { id: "review", name: "Review", role: "代码审查", description: "切片提交后进行真实代码审查。", group: "development", capabilities: ["只读代码审查", "结构化审查结论"] },
  { id: "qa", name: "QA", role: "运行验证", description: "验证预览质量，执行集成验证。", group: "development", capabilities: ["集成验证", "预览检查"] },
  { id: "devops-delivery", name: "DevOps Delivery", role: "交付 / 导出", description: "汇总交付产物并生成最终报告。", group: "development", capabilities: ["产物: 交付报告"] },
];

export const LIFECYCLE = [
  { id: "requirement", label: "Require", statuses: ["Draft Requirement", "Asking Questions"] },
  { id: "prd", label: "PRD", statuses: ["PRD Ready"] },
  { id: "plan", label: "Plan", statuses: ["Tech Plan Review"] },
  { id: "develop", label: "Develop", statuses: ["Developing", "Change Review"] },
  { id: "test", label: "Test", statuses: ["Testing"] },
  { id: "deploy", label: "Deploy", statuses: ["Deploying"] },
  { id: "deliver", label: "Deliver", statuses: ["Awaiting Acceptance", "Delivered"] },
];

export const GATES: Record<string, { title: string; description: string; options: string[] }> = {
  requirement_confirm: { title: "确认需求", description: "PRD 与验收标准已生成，请 review 后决定是否进入开发。", options: ["approve", "revise_then_approve", "reject_and_redo", "custom"] },
  tech_plan_confirm: { title: "确认技术方案", description: "架构师已产出技术方案，请 review 后决定是否开始实现。", options: ["approve", "revise_then_approve", "reject_and_redo", "custom"] },
  requirement_stuck: { title: "需求完成度不达标", description: "多轮问答后需求完成度仍未达到阈值，需要你决定如何继续。", options: ["keep_answering", "force_continue", "fail"] },
  slice_failure: { title: "切片开发失败", description: "某个功能切片在重试预算内未能完成，需要你决定如何处理。", options: ["retry", "replan", "replan_slices", "request_skip_slice", "fail"] },
  change_review: { title: "变更评审", description: "收到变更请求，请决定如何调整当前计划。", options: ["update_plan", "revise_tech_plan", "reject"] },
  deployment: { title: "部署确认", description: "先预览当前构建，确认无误后放行部署。", options: ["approve", "reject", "custom"] },
  dangerous_operation: { title: "危险操作确认", description: "Agent 即将执行高风险操作，请确认是否放行。", options: ["approve", "skip_risk_and_continue", "reject", "custom"] },
  final_acceptance: { title: "最终验收", description: "项目已交付，请验收通过或说明问题后驳回重做。", options: ["accept", "reject_and_redo"] },
};

export const OPTION_LABELS: Record<string, string> = {
  approve: "通过并继续", revise_then_approve: "修改后通过", reject_and_redo: "驳回重做", custom: "自定义意见",
  keep_answering: "继续澄清", force_continue: "接受风险并继续", fail: "终止流程", retry: "重试该切片",
  replan: "重做技术方案", replan_slices: "重排功能切片", request_skip_slice: "跳过该切片", update_plan: "更新开发计划",
  revise_tech_plan: "修改技术方案", reject: "拒绝", skip_risk_and_continue: "跳过风险并继续", accept: "验收通过",
};

export const REVIEW_ARTIFACTS: Record<string, Array<{ label: string; suffix: string }>> = {
  requirement_confirm: [{ label: "PRD（最新版）", suffix: "prd-latest.md" }, { label: "验收标准（最新版）", suffix: "ac-latest.md" }],
  tech_plan_confirm: [{ label: "技术方案（最新版）", suffix: "tp-latest.md" }],
  final_acceptance: [{ label: "交付报告", suffix: "delivery-report.md" }],
};
