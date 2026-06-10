# UI v2 Direction

## 决策

OneCompany 前端将做一版全新的 UI v2。

保留：

- 当前后端 API。
- 当前 SSE/event/durable-state 业务模型。
- 当前技术栈。
- 当前配色 token 方案。
- Stream / Swimlane / Right Workspace / Project Hub / Settings 这些业务表面。

重做：

- 整体视觉层级。
- 左侧 agent console 的信息组织。
- agent run 展开方式。
- 泳道密度与交互。
- right workspace 的局部布局。
- top nav 的状态表达。
- 组件体系与交互状态。

不继承：

- 当前页面的具体布局像素。
- 当前 Figma baseline 的卡片组合方式。
- 当前业务组件里的局部 Tailwind 样式。
- 当前“线性日志优先”的视觉层级。

## Token 继承

UI v2 必须继续使用当前配色 token 语义：

```css
--oc-app-bg
--oc-surface-base
--oc-surface-raised
--oc-surface-warm
--oc-border-muted
--oc-text-primary
--oc-text-muted
--oc-accent-primary
--oc-accent-soft
--oc-status-success
--oc-status-warning
--oc-status-danger
```

这些 token 可以重新映射到 Tailwind/shadcn semantic tokens，但不应该被替换成另一套品牌色。

允许新增 token：

- `--oc-surface-code`
- `--oc-border-active`
- `--oc-status-info`
- `--oc-agent-orchestrator`
- `--oc-agent-requirement`
- `--oc-agent-development`

新增 token 必须从当前配色体系推导，不能引入不相干的主色。

## UI v2 的第一屏目标

首屏必须让用户立即理解三件事：

1. 当前项目正在由哪个主流程驱动。
2. `Orchestrator Agent` 当前拉起了哪个 group 和 child agent。
3. 当前阻塞点、下一步用户动作、测试/preview/workspace 状态是什么。

推荐首屏结构：

```text
Top Nav
  project / status / active group / progress / blocker / actions

Main
  Left Agent Console
    Orchestration Strip
    Stream or Swimlane
    Composer

  Right Project Workspace
    Files / Preview / Terminal / Tests / Report
```

这不是要求复刻旧 layout，而是要求保留业务信息关系。

## 新 UI 视觉关键词

- agent-first
- operational
- inspectable
- compact but readable
- strongly stateful
- auditable
- local-first
- developer-console

## 新 UI 不该像什么

- 不像普通 SaaS dashboard。
- 不像聊天应用。
- 不像单一 terminal transcript。
- 不像 marketing landing page。
- 不像三栏信息墙。
- 不像只有日志的 CI 页面。

## 建议的设计探索方向

### Direction A: Agent Command Center

左侧强调 Orchestrator 和子 agent 调度，右侧是 workspace。

适合默认实现。

特点：

- Orchestration Strip 很强。
- Stream 是主叙事。
- 每个 agent run 像可展开任务单。
- gate 在时间线中强提醒。

### Direction B: Mission Control Swimlane

泳道更强，信息流作为 detail drawer 或 secondary renderer。

适合展示复杂多 agent 并行。

风险：

- 容易过密。
- 需要更强响应式策略。

### Direction C: Developer Workbench

右侧 workspace 更强，左侧 agent console 更像运行控制台。

适合 coding/testing/preview 阶段。

风险：

- requirement 阶段可能显得 workspace 太空。

## 推荐选择

最终采用 Direction A + Direction B：

- 默认进入 `Stream Mode`，保持 Agent Command Center 的叙事清晰度。
- `Swimlane Mode` 是同一位置的一键切换视图，采用 Mission Control 的强泳道表达。
- 两个模式共享同一 `Orchestration Strip`、同一 projection、同一 composer/gate policy。
- 用户切换模式时不丢失当前 selected run、open gate、scroll/selection preference 和右侧 workspace deep link。

实现时不应先复刻当前 UI，再微调。应先建立 projection、token、组件和新 layout shell，再逐步接入真实数据。
