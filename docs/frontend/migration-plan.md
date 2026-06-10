# Frontend Migration Plan

目标：先文档，后开发；保留技术栈、后端和当前配色 token 方案，做一版全新的 UI v2。

这不是在当前 UI 上做局部美化。现有实现只作为数据接线、业务逻辑和行为参考。新 UI 应先建立 token、projection、组件和 layout shell，再接入现有数据。

完整执行计划、里程碑、验收门和 rollout 策略见 `frontend-redesign-plan.md`。本文件保留为迁移阶段纲要。

当前实施状态见 `implementation-status.md`。截至 2026-06-10：Phase 4 的核心可靠性改造、Phase 5 的真实数据 adapter，以及 Phase 6 的 Current Work / strict event history / runtime density 已完成；Phase 7/8 已部分实现；默认路由切换尚未开始。

## Phase 0: 文档冻结

产物：

- `docs/frontend/design-brief.md`
- `docs/frontend/information-architecture.md`
- `docs/frontend/agent-orchestration-ui.md`
- `docs/frontend/stream-and-swimlane-contract.md`
- `docs/frontend/design-system.md`
- `docs/frontend/migration-plan.md`

验收：

- 主 agent + group + child agent 模型已确认。
- 默认信息流 + orchestration strip 已确认。
- 泳道作为同源投影第二视图已确认。
- UI v2 全新界面 + 保留当前配色 token 方案已确认。
- `business-flow-handbook.md` 已作为业务契约层吸收，后续 UI 不适配当前已知错误行为。

## Phase 0.5: 业务契约冻结

任务：

- 把 12 个 project status、合法状态转换、M13 目标行为固化为前端 projection 测试 fixture。
- 定义 composer mode matrix：requirement、question round、gate、change request、deployment URL、read-only、paused。
- 定义 open gates / blocking gate / resolved gate 的统一投影。
- 定义 `Current Work Pin` 与严格 `seq` timeline 的边界。
- 定义 right workspace 五 tab 的 API/SSE 数据源。
- 定义 Integrations 的状态、mock badge 和 offline Skill Pack 呈现。

验收：

- 新 UI fixture 覆盖 Draft、Asking Questions、PRD Ready、Developing、Testing、Deploying、Awaiting Acceptance、Delivered、Failed、Paused。
- `Testing -> Change Review -> Testing`、deployment reject 回 Testing、approve PRD 自动到 Tech Plan Review 等 M13 行为在 fixture 中可表达。
- 前端不会因为当前实现缺陷而写死错误路径。

## Phase 1: 现状审计

任务：

- 截取当前 console、stream、swimlane、settings、project hub、right panel。
- 列出现有组件和重复样式。
- 列出现有 token 使用和硬编码颜色。
- 标记哪些业务行为需要保留，哪些视觉实现不再继承。

建议工具：

- Codex Browser plugin：打开本地应用、截图、检查响应式。
- Figma MCP：读取现有 Figma baseline，只作为旧版业务结构参考。
- `rg`：扫描 className、颜色、inline style。

验收：

- 形成 `docs/frontend/audit.md`。
- 输出保留/重做清单，而不是对旧 UI 做微调建议。

## Phase 1.5: UI v2 概念稿

任务：

- 基于 `ui-v2-direction.md` 画出 2-3 个新 UI 方向。
- 都必须继承当前 `--oc-*` 配色 token。
- 都必须表达 Orchestrator -> Group -> Child Agent 的层级。
- 都必须包含 Stream / Swimlane / Right Workspace。

验收：

- 选定一个方向作为实现目标。
- 旧 Figma baseline 不再作为视觉验收标准。

## Phase 2: Token 合并

任务：

- 统一 `--oc-*` 和 shadcn token 的映射。
- 明确 semantic token 是唯一产品语义来源。
- 把现有 warm token + developer console 派生 surface 写入 CSS。
- 移除或替换明显冲突的一次性颜色。

验收：

- app shell 和核心 UI 使用同一 token。
- 没有新增 hardcoded palette。
- dark/code/log surface 有明确 token。

## Phase 3: `packages/ui` 基础组件

优先组件：

- Button
- IconButton
- Tabs
- Panel
- Badge / StatusPill
- Dialog
- Input / Textarea
- SplitPane
- CodeBlock / LogBlock

验收：

- `apps/web` 使用 `@oc/ui` 或明确的本地 wrapper。
- 高频按钮、tab、panel 不再各写各的样式。
- 每个组件有最小测试或 UI catalog 示例。

## Phase 4: Projection Store

状态：核心契约完成。

已完成 SSE no-rollback、事件去重排序、主要 event taxonomy、composer mode、UI v2 adapter 的 Current Work / strict event history 边界，以及 12 状态、8 gate、多 gate scenario matrix。`CurrentWork` 继续作为 UI v2 adapter contract；如果后端未来提供正式 current-work snapshot，再上移到 canonical `ConsoleProjection`。

任务：

- 先写 projection fixture tests。
- 从 event log + durable snapshot 构造统一 projection。
- 定义 timeline、agent groups、runs、open gates、blocking gate、next user action。
- 使用 `max(currentSeq, snapshot.lastSeq)` 管理 SSE 游标。
- timeline 按 `seq` 升序，active 状态进入 `Current Work Pin`，不重排事件流。
- Stream 和 Swimlane 都消费这个 projection。

验收：

- Stream 和 Swimlane 没有分离状态。
- lossless switching 测试通过。
- user/gate/tool/diff/test/artifact/change_request/deployment/run.failed 都能在 projection 中追踪。
- composer mode 完全由 projection 派生，业务提交结果只信 API/SSE/snapshot。

## Phase 5: UI v2 Layout Shell

状态：完成。

`/dev/ui-v2` fixture shell 和 `/projects/[id]?ui=v2` 真实数据入口均已可用。

任务：

- 新建 UI v2 app shell。
- 接入 top nav、left agent console、right workspace。
- 只接最小 mock/projection fixture，不急着接全量真实数据。
- 用当前 token 渲染新视觉语言。

验收：

- 新 UI 的第一屏能看出 Orchestrator、active group、active child agent、blocker、next action。
- 不是旧 UI 的换皮。

## Phase 6: Agent Console

状态：核心 Stream 和状态安全完成，其余部分完成。

已完成真实 Orchestration Strip、Current Work、严格 `seq` Event History、分组折叠 Run History、分批展开、gate、projection-driven composer、live API actions、Paused 全局禁用、终态只读和 Testing-only Deploy。下一步是 Swimlane 完整化和 Top Nav 的 Hub / Settings 入口。

任务：

- 实现 `OrchestrationStrip`。
- 实现 `Current Work Pin`，突出 active run、blocking gate、next action。
- 重构 Stream renderer：
  - orchestrator message
  - group card
  - child agent run
  - P/A/O/R segments
  - inline gate
  - status_changed 阶段分隔线
  - change_request / deployment / artifact / run.failed
  - sticky composer
- 实现状态机驱动的 composer mode。
- 实现 Paused banner 和 mutating actions 禁用。
- 实现 deep links 到右侧 tabs。

验收：

- 当前主流程和 active child agent 一眼可见。
- timeline 仍严格按 `seq` 渲染。
- gate 阻塞时 composer 不能绕过策略。
- 多个 open gates 中 blocking gate 接管 composer，其他 gate 仍可发现。
- verbose output 默认折叠。

## Phase 7: Swimlane

状态：核心完成，retrying 契约待后端。

已完成同源 view model、P/A/O/R cells、Requirement / Development group hierarchy、user/gate markers、paused/interrupted、workspace deep links、selected run event refs、短摘要和完整文本展开。`retrying` 等待后端提供 attempt/retry 权威信号。

任务：

- 按 group / agent 渲染 rows。
- Plan / Act / Observe / Reflect / Status 列。
- user/gate/system markers 可发现。
- active/failed/gated/retrying 状态可扫描。

验收：

- 同一 fixture 在 Stream 和 Swimlane 数据一致。
- 点击 swimlane cell 能打开对应 run detail 或跳转右侧 tab。

## Phase 8: Right Workspace Polishing

状态：完成。

五个真实 API-backed tab 已嵌入 UI v2，并统一使用 shared primitives、`--oc-*` 派生 token、empty/code/log/status 表现。Terminal 403 gate 会按 `gateId` 从 open-gates API 读取权威 options。

任务：

- Files tab：file tree + content + diff + artifact versions，保持只读。
- Preview tab：browser frame + health strip + empty reason。
- Terminal tab：risk/gate/logging 状态显式化，403+gateId 就地闭环。
- Tests tab：per-slice checks 和 final suite 分区，覆盖 typecheck/build/vitest/playwright。
- Report tab：PRD、acceptance、run instruction、9-section delivery report、risk summary。

验收：

- 右侧五 tab 保持 exactly five。
- 不新增第六 tab。
- 每个 tab 都能从 Stream/Swimlane deep link 进入。

## Phase 9: Project Hub And Settings

状态：部分完成。

UI v2 顶栏已接通 Project Hub 和 Settings，跨项目打开会保留 `?ui=v2`。下一阶段重构两者内容布局与信息层级。

任务：

- Project Hub 强化 lifecycle timeline、project risk/gate overview、artifact cards。
- Settings 只保留 global readiness。
- project switcher dropdown 和 Project Hub 互斥。
- Settings 显示 engine degraded / mock mode / readiness，但不管理项目。

验收：

- Settings 没有项目管理。
- Project Hub 没有 secret/model/sandbox/risk policy 配置。
- 多项目状态清楚。

## Phase 9.5: Integrations

任务：

- 建 Integrations 页面或 Settings 子页。
- 渲染 connector status、scopes、secret readiness、offline Skill Pack。
- mock/simulated 状态必须带徽章。
- 缺凭据显示 `not_configured` 和配置引导。

验收：

- 不展示 secret value。
- 不把 mock 成功当真实成功。
- enable/call 交互走 integration API。

## Phase 10: Visual Regression And Governance

任务：

- 建 `/dev/ui` 或 Storybook。
- 添加 Playwright baseline screenshots。
- 在 `AGENTS.md` 写前端设计约束。
- 增加 lint/check 脚本扫描 hardcoded colors 和禁用组件模式。

验收：

- 前端改动有截图或视觉回归依据。
- 新 UI 默认用 design system。
- Codex 后续改前端会先读本目录和 `AGENTS.md`。

## 推荐执行顺序

```text
docs -> business contract -> audit -> UI v2 concepts -> tokens -> packages/ui -> projection -> new shell -> stream/composer -> swimlane -> right tabs -> hub/settings -> integrations -> governance
```

不要直接在旧页面上改样式。先建立 token、组件、projection 和新 shell，否则重写后仍会继续野蛮生长。
