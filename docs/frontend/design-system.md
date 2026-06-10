# Frontend Design System

## 技术边界

保持现有技术栈：

- Next.js
- React
- Tailwind CSS
- Base UI
- shadcn 风格组件组织
- class-variance-authority
- lucide-react
- `packages/ui`

UI v2 会重做界面和组件语言。后续所有共享 UI 组件应逐步沉淀到 `packages/ui`。业务页面只组合组件，不重新定义基础视觉规则。

## Token 分层

推荐三层 token：

1. primitive tokens：原始色值、间距、字号。
2. semantic tokens：产品语义，例如 `app.bg`、`surface.base`、`text.muted`。
3. component tokens：组件局部语义，例如 `agentRun.activeBg`。

当前 `--oc-*` token 是 UI v2 必须继承的配色方案基础。

保留 token：

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

## 颜色语义

保留当前 warm token 方案，但 UI v2 不复刻旧 warm console 版式。代码、终端、diff、测试 trace 可以使用深色或中性 surface 增强开发者工具感。

| Token | 用途 |
| --- | --- |
| `app.bg` | warm off-white app background |
| `surface.base` | 主 panel / paper surface |
| `surface.raised` | card、modal、tab |
| `surface.warm` | user message、selected project、active emphasis |
| `surface.code` | terminal、trace、diff block |
| `border.muted` | 默认边框 |
| `border.active` | active agent / focused cell |
| `text.primary` | 主文本 |
| `text.muted` | 辅助文本 |
| `accent.primary` | primary action、active tab、current progress |
| `accent.soft` | active low-emphasis background |
| `status.success` | passed、approved、delivered |
| `status.warning` | gate、pending、risk notice |
| `status.danger` | failed、high risk |
| `status.info` | system、preview、artifact |

允许在 UI v2 中新增少量派生 token，但必须从当前配色体系推导：

| Token | 用途 |
| --- | --- |
| `surface.code` | terminal、trace、diff block |
| `border.active` | active agent、focused swimlane cell |
| `agent.orchestrator` | Orchestrator Agent 标识 |
| `agent.requirement` | Requirement Group 标识 |
| `agent.development` | Development Group 标识 |

## 字体和密度

原则：

- console 使用紧凑密度。
- 文本层级清晰，不使用 landing-page 大标题。
- agent row、test row、tool row 应可快速扫描。

建议：

- page title: 18-20px
- panel title: 14-16px
- body: 13-14px
- metadata: 11-12px
- code/log: 12px mono
- button height: 28-34px
- compact row height: 32-44px
- card radius: 6-8px

## 核心组件

优先沉淀到 `packages/ui`：

- `Button`
- `IconButton`
- `Input`
- `Textarea`
- `Tabs`
- `Dialog`
- `Panel`
- `Badge`
- `StatusPill`
- `PausedBanner`
- `SplitPane`
- `Toolbar`
- `DropdownMenu`
- `EmptyState`
- `CodeBlock`
- `LogBlock`
- `DiffPreview`
- `TestResultRow`
- `GateCard`
- `ComposerModeShell`
- `QuestionRoundForm`
- `DeploymentUrlForm`
- `AgentAvatar`
- `AgentStatusDot`
- `AgentRunCard`
- `AgentStepSegment`
- `OrchestrationStrip`
- `SwimlaneBoard`
- `SwimlaneCell`
- `IntegrationStatusCard`

业务组件可以继续放在 `apps/web/src/components/*`，但不能复制基础样式。

## Agent 组件规则

### AgentRunCard

必须支持：

- compact / expanded
- active / completed / failed / gated
- Plan / Act / Observe / Reflect segments
- tool/test/diff/artifact chips
- deep links

### OrchestrationStrip

必须支持：

- current group
- active child agent
- phase
- progress
- blocker
- next allowed action

### SwimlaneCell

必须支持：

- active
- completed
- waiting
- gated
- failed
- retrying
- has tool calls
- has tests
- has diffs

### ComposerModeShell

必须支持：

- requirement input
- question round answer form
- gate decision form
- change request form
- deployment URL form
- read-only state
- paused/disabled state

所有 mode 必须显示“系统现在在等你做什么”。有 gate 时，free text 必须绑定到明确 decision。

### PausedBanner

必须支持：

- pausedFrom
- resume action
- disabled reason
- interrupted slice hint

Paused 不是普通 warning；它改变页面交互可用性。

### IntegrationStatusCard

必须支持：

- `not_configured`
- `connected`
- `expired`
- `offline_fallback`
- `disabled`
- mock/simulated badge
- secret name only, no secret value

## 交互规则

- 图标按钮使用 lucide-react。
- 不熟悉的 icon 必须有 tooltip。
- tabs 用 segmented/tab control，不用普通文本按钮伪装。
- gate option 用明确的 button group 或 segmented options。
- risk 和 destructive action 必须有 danger 风格。
- completed historical decisions 使用 compact chip。
- verbose logs 默认折叠。
- keyboard focus ring 必须可见。
- disabled action 必须说明原因，尤其是 Deploy 和 Paused 状态下的操作。
- mock/simulated 数据必须带清晰徽章。

## 禁止事项

- 业务组件直接写新的硬编码颜色。
- 同类按钮在不同页面自定义不同 padding/radius。
- 新增 button variant 不写入 design system。
- 卡片套卡片。
- 装饰性大渐变、orb、bokeh。
- 超大 hero。
- Files tab 允许直接编辑。
- Terminal 绕过 risk/gate。
- Composer 在 gate 打开时接受无 decision 的自由文本。
- Project Hub 和 Settings 混用项目管理与全局配置。
- Integrations 缺凭据时展示 connected 或成功状态。

## 可访问性

最低要求：

- 所有交互元素可键盘访问。
- tab / dialog / dropdown 使用可访问 primitive。
- focus ring 清晰。
- color 不是唯一状态表达，必须有文本或 icon。
- terminal/log/diff 区域可滚动且不会撑破布局。
- sticky composer 不遮挡最后一条消息。

## 实施约束

- 新组件优先放入 `packages/ui`。
- 业务页面通过 props 组合组件。
- Tailwind class 可以使用，但颜色、radius、spacing 应来自 token 或组件 variant。
- 每个共享组件至少有基础测试或 UI catalog 示例。
- 重大视觉变更必须更新本目录文档。
