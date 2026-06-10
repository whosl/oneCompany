# OneCompany Frontend Design Documents

这些文档用于把 OneCompany 前端从“野蛮生长”收敛成稳定的产品界面系统。

当前已进入 UI v2 实施阶段，不改现有后端，不替换现有前端技术栈。开发继续使用 Next.js、React、Tailwind CSS、Base UI、shadcn 风格组件、`packages/ui` 和现有 API/SSE/状态机。

当前入口：

- `/dev/ui-v2`：完整 fixture 和视觉 QA。
- `/projects/[id]?ui=v2`：真实 snapshot、SSE、gate、composer 和五个 workspace tab。
- `/projects/[id]`：默认仍为 legacy console，直到 rollout 验收完成。

## UI v2 决策

OneCompany 将做一版全新的前端 UI。现有 Figma 和当前实现只作为业务信息与反例参考，不再作为视觉实现目标。

必须保留的是当前配色 token 方案，尤其是 `apps/web/src/styles/tokens.css` 中的 `--oc-*` token 语义：warm app background、paper surfaces、warm borders、dark ink text、copper accent、success/warning/danger 状态色。

Claude/Fable 产出的 `business-flow-handbook.md` 已被吸收到本目录作为业务契约层。后续前端开发应把它视为状态机、gate、composer、API/SSE 和 M13 目标行为的开发约束；`ui-v2-screen-spec.md`、`information-architecture.md` 和 `design-system.md` 负责把这些约束落成界面结构、交互和组件规范。

## 设计决策

- OneCompany 前端是一个 multi-agent runtime console，不是普通 dashboard。
- 用户主要和一个 `Orchestrator Agent` 对接。
- `Orchestrator Agent` 按工作流拉起 `Requirement Group` 和 `Development Group`。
- 每个 group 下有多个子 agent，例如 Intake、Analyst、Scorer、Architect、Planner、Coding、Review、QA、DevOps。
- 默认视图是信息流，但信息流顶部必须固定显示 agent 编排状态。
- 泳道视图是同一份事件投影的第二渲染方式，用于查看多 agent 并行、等待、失败和交接。
- UI v2 重新设计整体界面、布局细节和组件语言，但继承当前 `--oc-*` 配色 token 方案。
- 视觉参考 Cursor / Codex / opencode 的开发者控制台感，不照搬现有 Figma baseline。

## 阅读顺序

1. [business-flow-handbook.md](business-flow-handbook.md) - 业务流程、状态机、gate、事件与功能设计的总手册（先读这个）。
2. [design-brief.md](design-brief.md) - 产品定位、参考产品、视觉原则。
3. [ui-v2-direction.md](ui-v2-direction.md) - 全新 UI 的边界、继承项和重做项。
4. [ui-v2-screen-spec.md](ui-v2-screen-spec.md) - UI 每一块的功能、展示逻辑和交互规则。
5. [information-architecture.md](information-architecture.md) - 页面结构和核心区域职责。
6. [agent-orchestration-ui.md](agent-orchestration-ui.md) - 主 agent、子 agent、agent run、gate 和状态语义。
7. [stream-and-swimlane-contract.md](stream-and-swimlane-contract.md) - 信息流和泳道如何共享同一投影。
8. [design-system.md](design-system.md) - tokens、组件、布局和交互规范。
9. [frontend-redesign-plan.md](frontend-redesign-plan.md) - 完整前端改造执行计划、里程碑和验收门。
10. [implementation-status.md](implementation-status.md) - 当前已完成内容、验证证据、已知缺口和下一执行队列。
11. [migration-plan.md](migration-plan.md) - 从当前实现迁移到新设计的阶段纲要。

## 来源

- `spec.md` v0.3.3 是业务逻辑和状态机的最高优先级来源。
- `README.md` / `README.zh-CN.md` 提供产品叙事和端到端流程。
- `handbook/phase-08-right-panel-tabs.md` 和 `handbook/phase-09-renderers.md` 提供现有业务约束。
- Figma baseline: `OneCompany Console - Claude Style Draft` 只作为旧版基线和业务结构参考，不作为 UI v2 视觉目标。
- 参考产品：Cursor Background Agents、OpenAI Codex、Claude Code、opencode。

## 冲突规则

- 工作流、状态机、gate 策略、风险控制、事件模型以 `spec.md` 为准。
- M13 目标行为以 `business-flow-handbook.md` 为准；不要为了适配当前已知缺陷而写新 UI。
- 视觉层级、组件边界、交互呈现、前端设计治理以本目录文档为准。
- 如果实现与文档冲突，先更新文档并说明原因，再改代码。
