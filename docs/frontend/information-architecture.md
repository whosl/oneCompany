# Frontend Information Architecture

## 总体布局

OneCompany 使用固定的 desktop-first console 布局：

```text
Top Navigation
Main Console
  Left: Agent Console
    Orchestration Strip
    Stream Mode (default) | Swimlane Mode
    Sticky Composer
  Right: Project Workspace
    Files | Preview | Terminal | Tests | Report
Project Hub Modal
Settings Modal
Integrations Page
```

默认比例：

- top nav: 64px
- left panel: 42-46%
- right panel: 54-58%
- split pane 可拖拽

## Top Navigation

Top nav 只展示跨页面、跨项目的当前上下文。

必须包含：

- OneCompany logo 和产品名。
- Project switcher。
- 当前 project status。
- 当前 lifecycle phase。
- 当前 active group。
- 当前 progress，例如 `Slice 2 / 3`。
- Pause / Resume。
- Deploy entry。
- Avatar dropdown，进入 Settings。
- 全局 paused banner，项目为 `Paused` 时显示。

状态 pill 必须生命周期一致：

- `Developing` 不应同时显示 active group 为 `Requirement Group`。
- 进入 development 后，requirement completeness 是历史信息，不是 active progress。
- 如果被 gate 阻塞，top nav 应显示 gate 状态，但不替代具体 gate card。
- Deploy 在不可用阶段应展示 disabled reason，不静默禁用。
- `Paused` 时除 Resume 外的 mutating controls 都禁用。

## Left: Agent Console

左侧是 OneCompany 的核心区域。它不是普通 log viewer，而是 agent orchestration surface。

### Orchestration Strip

信息流和泳道上方共享同一个 `Orchestration Strip`。

它固定展示：

- 当前 `Orchestrator Agent` 状态。
- 当前主流程：Requirement / Development / Testing / Delivery。
- 当前 active group。
- 当前 active child agent。
- 当前 slice / question round / gate。
- open blocker。
- next allowed user action。

示例：

```text
Orchestrator
Development Group -> Coding Agent
Slice 2 / 3 · Act phase · gated: dangerous_operation
Next: approve command, revise instruction, or reject
```

### Stream Mode

默认视图。按时间展示 user、orchestrator、agent、system、gate 事件。

Stream 包含两个层次：

- `Current Work Pin`：派生摘要，突出 active run、blocking gate、next action。
- `Timeline`：严格按 event `seq` 升序渲染，不为突出当前状态重排。

必须支持：

- user 原始需求。
- normalized requirement。
- orchestrator handoff。
- group start / group complete。
- child agent run。
- Plan / Act / Observe / Reflect。
- tool call。
- command output。
- diff。
- test result。
- artifact。
- inline gate。
- risk warning。
- status changed 阶段分隔线。
- deployment event。
- change request event。
- run failed event。

### Swimlane Mode

第二视图。展示同一投影中的 agent 进度。

推荐结构：

```text
Group / Agent | Plan | Act | Observe | Reflect | Status
```

Requirement Group 和 Development Group 可以分段显示。活跃 group 优先展开，历史 group 可以折叠。

泳道必须能发现：

- user message marker
- gate marker
- failed / retrying / blocked cell
- tool/test/diff summary
- handoff from one agent to another

### Sticky Composer

composer 永远贴近左侧底部。

composer mode 由 `project.status + blockingGate` 决定：

- `Draft Requirement`：一句话需求输入。
- `Asking Questions`：问题卡片 + A/B/C/D 答案 + 整轮提交。
- `Developing` / `Testing`：change request 输入。
- `Deploying`：部署 URL 输入 + gate 决策。
- `Delivered` / `Failed`：只读。
- `Paused`：禁用。

有 gate 时：

- 只显示该 gate 允许的 options。
- free text 必须绑定到某个允许的 decision。
- 不允许 free text 隐式 approve。
- 多个 open gates 时，composer 接管 `blockingGateId`，其他 gate 留在信息流或 Project Hub 中可发现。

## Right: Project Workspace

右侧不是辅助边栏，而是当前项目的 workspace。

必须保持五个 tab：

1. Files
2. Preview
3. Terminal
4. Tests
5. Report

### Files

显示 generated project source、artifacts、diffs。只读。agent 或 terminal 负责修改文件。

数据源：

- `GET .../files`
- `GET .../diffs`
- artifact metadata from snapshot/events

### Preview

显示本地 preview 或 deployment URL。必须包含 preview health：

- reachable
- Playwright ready
- console errors

数据源：

- `GET .../preview/status`
- preview / deployment related SSE events

### Terminal

自由终端，但不是治理绕过点。命令和输出必须走 risk grading、gate、redaction、logging。

403 + `gateId` 必须就地渲染 gate 卡，不能只显示错误 toast。

### Tests

展示 per-slice checks 和 final acceptance suite 的区别。

测试项至少包括：

- TypeScript
- Vitest unit/integration
- Build
- Playwright E2E
- Acceptance

final suite 至少区分 `final:typecheck`、`final:build`、`final:vitest`、`final:playwright`，任一失败即停并展示 QA notes。

### Report

展示 PRD、acceptance cases、run instructions、delivery report、risks、deployment/preview URL、final acceptance summary。

delivery report 固定 section：

- requirement-summary
- confirmed-tech-stack
- feature-list
- directory-structure
- run-instructions
- test-results
- deployment-url
- risks-and-limitations
- follow-up-recommendations

## Project Hub

Project Hub 从 project switcher 打开，是多项目管理主入口。

包含：

- search / filters
- project list
- status/risk/gate indicators
- selected project summary
- full lifecycle timeline
- open gate summary
- preview/deployment summary
- artifact cards
- Open / Pause / Archive / New Project

Project Hub 和 compact project dropdown 互斥，不能同时遮挡。

## Settings

Settings 从 avatar 打开，只管理全局环境和 readiness。

包含：

- workspace paths
- generated projects root
- API key readiness，不显示 secret value
- Cloudflare Tunnel readiness
- Node / pnpm / Git / Docker / SQLite / Playwright checks
- read-only policy chips

不包含：

- project management
- model routing settings
- sandbox policy controls
- shell risk controls
- raw secrets
- external connector detailed configuration

## Integrations

Integrations 是独立页面或 Settings 下的明确子页，不应混在 Project Hub。

展示：

- connector display name
- status：`not_configured` / `connected` / `expired` / `offline_fallback` / `disabled`
- scopes
- secret readiness，只显示 secret 名称
- offline Skill Pack
- mock/simulated badge

规则：

- 缺凭据显示 `not_configured`，不能显示假成功。
- mock 模式必须明显标注。
- enable/call 行为必须走 integration API。
