/** Gate definitions and option labels, ported from apps/tui/src/catalog.ts. */

export type GateDefinition = {
  title: string;
  description: string;
  options: string[];
};

export const GATE_DEFINITIONS: Record<string, GateDefinition> = {
  requirement_confirm: {
    title: "确认需求",
    description: "PRD 与验收标准已生成，请 review 后决定是否进入开发。",
    options: ["approve", "revise_then_approve", "reject_and_redo", "custom"],
  },
  tech_plan_confirm: {
    title: "确认技术方案",
    description: "架构师已产出技术方案，请 review 后决定是否开始实现。",
    options: ["approve", "revise_then_approve", "reject_and_redo", "custom"],
  },
  requirement_stuck: {
    title: "需求完成度不达标",
    description: "多轮问答后需求完成度仍未达到阈值，需要你决定如何继续。",
    options: ["keep_answering", "force_continue", "fail"],
  },
  slice_failure: {
    title: "切片开发失败",
    description: "某个功能切片在重试预算内未能完成，需要你决定如何处理。",
    options: ["retry", "replan", "replan_slices", "request_skip_slice", "fail"],
  },
  change_review: {
    title: "变更评审",
    description: "收到变更请求，请决定如何调整当前计划。",
    options: ["update_plan", "revise_tech_plan", "reject"],
  },
  deployment: {
    title: "部署确认",
    description: "确认对外暴露的部署 URL（测试阶段已生成 Preview，可直接批准）。",
    options: ["approve", "reject", "custom"],
  },
  dangerous_operation: {
    title: "危险操作确认",
    description: "Agent 即将执行高风险操作，请确认是否放行。",
    options: ["approve", "skip_risk_and_continue", "reject", "custom"],
  },
  final_acceptance: {
    title: "最终验收",
    description: "项目已交付，请验收通过或驳回重做（需说明问题）。",
    options: ["accept", "reject_and_redo"],
  },
};

/** Human-readable Chinese labels for gate option keys. */
export const GATE_OPTION_LABELS: Record<string, string> = {
  approve: "通过",
  revise_then_approve: "提出修改意见后通过",
  reject_and_redo: "驳回重做",
  custom: "自定义答复",
  keep_answering: "继续提问澄清（追加轮次）",
  force_continue: "强行继续生成 PRD（接受风险）",
  fail: "终止",
  retry: "重试该切片",
  replan: "重新规划技术方案",
  replan_slices: "重新规划切片",
  request_skip_slice: "跳过该切片",
  update_plan: "更新开发计划",
  revise_tech_plan: "修改技术方案",
  reject: "拒绝",
  skip_risk_and_continue: "跳过风险并继续",
  accept: "验收通过",
};

export function gateDefinition(gateType: string): GateDefinition {
  return (
    GATE_DEFINITIONS[gateType] ?? {
      title: gateType,
      description: "请处理该确认项以继续。",
      options: ["approve", "reject"],
    }
  );
}
