# Frontend Redesign Execution Plan

Status: v1.1 - implementation in progress
Date: 2026-06-10
Scope: OneCompany web frontend UI v2

## 1. Goal

把当前前端从“功能能跑但设计和状态承载分散”的状态，改造成一套可长期扩展的 multi-agent runtime console。

目标不是给旧页面换皮，而是建立：

- 统一业务契约：状态机、gate、事件、composer mode、右侧 workspace 数据源。
- 统一 projection：Stream、Swimlane、Composer、Top Nav、Right Workspace 共用一份派生数据。
- 统一视觉系统：继续使用 `--oc-*` token，但重做组件语言和布局。
- 渐进替换路径：先在 `/dev/ui-v2` 验证，再接真实数据，再替换 `/projects/[id]`。

## 2. Non-goals

- 不改后端工作流语义。
- 不替换 Next.js / React / Tailwind / Base UI / shadcn 风格组件组织。
- 不直接在旧 console 上继续堆局部样式。
- 不为了适配当前已知错误行为写新 UI。M13 目标行为优先。
- 不让前端拥有业务真相，例如状态转换合法性、gate policy、risk grade、authoritative test result。

## 3. Source Of Truth

优先级：

1. `spec.md`
2. `docs/frontend/business-flow-handbook.md`
3. `docs/frontend/stream-and-swimlane-contract.md`
4. `docs/frontend/ui-v2-screen-spec.md`
5. `docs/frontend/design-system.md`
6. 当前代码实现

如果当前代码与上述文档冲突，按文档修代码，不按旧实现固化错误路径。

## 4. Current State Summary

截至 2026-06-10，UI v2 已从静态概念稿进入真实数据候选实现阶段。

已完成：

- `/dev/ui-v2` 保留完整 fixture，作为视觉和交互 QA surface。
- `/projects/[id]?ui=v2` 已接入真实 snapshot、SSE 和 projection。
- `NEXT_PUBLIC_OC_UI_V2=1` 可以把 UI v2 设为环境默认。
- 新增 `ConsoleProjection -> UiV2Projection` adapter，UI v2 不依赖旧 console 内部组件状态。
- SSE hydrate 使用 `Math.max(currentSeq, snapshot.lastSeq)`，不会回退游标。
- projection 按 `eventId` 去重、按 `seq` 排序，补齐 agent reflect、run failed、change request、deployment、artifact、delivery report 和 status changed 映射。
- Composer 已由 projection mode 驱动，并移除新路径中的 `PRD Ready -> Start development` 入口。
- UI v2 支持真实 gate options、gate decision、需求输入、问题回答、change request 和 deployment URL 提交。
- Stream / Swimlane 共享 adapter 后的同一 view model，切换时保留 selected run。
- Stream 已拆分为 Requirement Snapshot、Current Work、分组 Run History 和严格 `seq` Event History。
- 历史 run 默认折叠并按 group 汇总，长历史使用分批展开；Stream / Swimlane 各自恢复滚动位置。
- Swimlane 已按 Requirement / Development 分组，支持 marker、workspace deep link、事件引用和两行短摘要。
- Right Workspace 保持五个 tab，并复用真实 Files / Preview / Terminal / Tests / Report API 组件。
- 真实 Developing 项目已完成桌面和 390px 移动端冒烟；无横向溢出，修复重复 React key 后 reload 无新增 console error。
- Web 验证通过：lint、typecheck、27 个测试文件、66 个测试。

仍未完成：

- 后端尚未提供 `retrying` attempt/retry 信号和 Agent 原生 `displaySummary`。
- Project Hub、Settings、Integrations 的 UI v2 内容改造。
- 默认路由切换、旧 console fallback 窗口和视觉回归基线。

详细实施状态和下一执行队列见 `implementation-status.md`。

## 5. Target Architecture

```text
ConsoleSnapshot + SSE EventEnvelope[]
  -> buildConsoleProjection()
      project phase/status
      current work pin
      timeline items, strict seq
      agent runs and groups
      swimlane rows/cells
      open gates + blocking gate
      composer mode
      right workspace summaries
      project hub summary
      settings/integrations readiness

  -> UI v2 shell
      TopNav
      OrchestrationStrip
      CurrentWorkPin
      StreamRenderer
      SwimlaneRenderer
      ComposerModeShell
      RightWorkspace
      ProjectHub
      Settings
      Integrations
```

核心原则：

- Projection 是唯一 UI 业务 view model。
- Stream 和 Swimlane 只负责渲染，不重新解释业务。
- Composer mode 由 projection 派生。
- Right Workspace 可以按 tab 拉取 detail API，但 tab header 和 deep link 来源由 projection 提供。
- UI state 只包括 selected mode、selected run、expanded state、selected tab、split width、scroll position、draft text。

## 6. Workstreams

### A. Business Contract Fixtures

目的：先用 fixture 固化所有业务场景，避免 UI 只覆盖 happy path。

新增或重构：

- `apps/web/src/lib/projection/fixtures/`
- `apps/web/src/lib/projection/scenarios/*.ts`

必须覆盖：

- Draft Requirement
- Asking Questions
- PRD Ready with `requirement_confirm`
- Tech Plan Review with `tech_plan_confirm`
- Developing with active coding run
- dangerous operation gate
- slice failure gate
- Change Review
- Testing with final suite running / failed / passed
- Deploying with deployment URL gate
- Awaiting Acceptance with final acceptance gate
- Delivered
- Failed
- Paused with `pausedFrom` and interrupted slice
- multiple open gates with one `blockingGateId`

验收：

- 每个 status 都有 projection fixture。
- 每个 fixture 能被 Stream、Swimlane、Composer、Top Nav 同时消费。

### B. Projection Store

目的：让前端能承载完整业务逻辑，但不拥有业务真相。

改造点：

- `apps/web/src/lib/projection/types.ts`
- `apps/web/src/lib/projection/build-projection.ts`
- `apps/web/src/lib/projection/use-console-projection.ts`

Projection 必须包含：

```ts
type ConsoleProjection = {
  snapshot: ConsoleSnapshot;
  events: EventEnvelope[];
  lastSeq: number;
  project: ProjectProjection;
  phase: PhaseProjection;
  currentWork?: CurrentWorkProjection;
  timeline: TimelineItem[];
  runs: AgentRunProjection[];
  groups: AgentGroupProjection[];
  swimlane: SwimlaneProjection;
  openGates: GateProjection[];
  blockingGateId?: string;
  composer: ComposerProjection;
  rightWorkspace: RightWorkspaceProjection;
};
```

关键修复：

- hydrate 后 `lastSeq = Math.max(currentSeq, snapshot.lastSeq)`。
- 所有 event 按 `seq` 去重和排序。
- `agent.reflect` 纳入 run segment。
- `run.failed` 渲染为失败事件。
- `change_request.created/resolved` 纳入 timeline。
- `deployment.started/url_confirmed/completed` 纳入 timeline。
- `delivery.report_generated` 纳入 timeline。
- `artifact.created` 纳入 timeline。
- `project.status_changed` 渲染为阶段分隔线。
- `human_gate.created/resolved` 不被 run grouping 吞掉。
- gate options 永远来自 snapshot/gate API。

验收：

- projection 测试覆盖所有事件类型。
- Stream -> Swimlane -> Stream 不丢数据。
- 多次 hydrate / SSE reconnect 不回退 seq。

### C. Design Tokens And Base Components

目的：停止局部 Tailwind 野生增长。

改造点：

- `apps/web/src/styles/tokens.css`
- `packages/ui`
- `apps/web/src/components/ui/*`

新增或规范：

- `Button`
- `IconButton`
- `Tabs`
- `Panel`
- `StatusPill`
- `Badge`
- `CodeBlock`
- `LogBlock`
- `SplitPane`
- `GateCard`
- `ComposerModeShell`
- `PausedBanner`
- `AgentRunCard`
- `AgentStepSegment`
- `SwimlaneBoard`
- `SwimlaneCell`
- `IntegrationStatusCard`

Token 要求：

- 继续使用 `--oc-*`。
- 允许新增 `--oc-surface-code`、`--oc-border-active`、`--oc-status-info`、agent group token。
- 禁止新业务组件写硬编码 palette。
- 移除 `tracking-wide` 这类会破坏紧凑 UI 的默认标签样式。

验收：

- `rg "bg-emerald|bg-amber|bg-rose|text-red|bg-card|text-muted-foreground"` 不再命中新 UI 业务组件。
- 所有主要状态都有文本 + 颜色双表达。

### D. UI v2 Shell Integration

目的：把 `/dev/ui-v2` 从 fixture shell 变成真实 console 的候选实现。

改造路径：

1. 保留 `/dev/ui-v2` 作为 visual QA surface。
2. 把 `UiV2Shell` 的 props 从 `UiV2Projection` 改为真实 `ConsoleProjection` 或 adapter 后的 `UiV2ViewModel`。
3. 新增 adapter：

```text
ConsoleProjection -> UiV2ViewModel
```

4. 在 `/projects/[id]` 增加 feature flag：

```text
/projects/[id]?ui=v2
NEXT_PUBLIC_OC_UI_V2=1
```

5. 验证通过后默认使用 UI v2。
6. 旧 console 保留一段时间作为 fallback。

验收：

- `/dev/ui-v2` 仍可用 fixture。
- `/projects/[id]?ui=v2` 使用真实 project 数据。
- UI v2 不需要知道旧 console 的组件内部状态。

### E. Top Nav And Orchestration Strip

目的：首屏清楚表达谁在编排、当前卡在哪里、用户下一步做什么。

必须展示：

- project name / slug
- exact project status
- lifecycle phase
- active group
- active child agent
- progress label
- blocker pill
- next action
- Pause / Resume
- Deploy with disabled reason
- Settings / Project Hub entry
- Paused banner

验收：

- Developing 不会显示 active group 为 Requirement。
- Deploy 不可用时有 reason。
- Paused 时除 Resume 外 mutating actions 禁用。

### F. Stream Renderer

目的：默认主视图，严格时间序，能解释整个业务过程。

结构：

```text
OrchestrationStrip
CurrentWorkPin
RequirementSnapshot
Timeline
  status separator
  user message
  orchestrator message
  group event
  agent run group
  tool call
  command output
  diff
  test result
  gate created/resolved
  change request
  deployment
  artifact
  run failed
Sticky Composer
```

关键规则：

- timeline 严格按 `seq`。
- CurrentWorkPin 可以置顶，但不是 timeline。
- gate 不从 timeline 消失。
- resolved gate 保留 decision record。
- verbose output 折叠。
- diff/test/report/deployment 支持 deep link 到右侧 tab。
- 用户上翻暂停 auto-scroll，显示 Jump to latest。

验收：

- 对照 `business-flow-handbook.md` §5.3 的事件映射逐项通过。
- 新增 projection + renderer 测试。

### G. Composer

目的：唯一用户输入口，由状态机驱动。

Mode matrix：

| Status / condition   | Mode                  |
| -------------------- | --------------------- |
| Draft Requirement    | requirement input     |
| Asking Questions     | question round answer |
| blocking gate exists | gate decision         |
| Developing / Testing | change request        |
| Deploying            | deployment URL + gate |
| Awaiting Acceptance  | final acceptance gate |
| Delivered / Failed   | read-only             |
| Paused               | disabled              |

关键修复：

- 移除 `PRD Ready -> Start development` 旧主路径。
- free text 不能隐式 approve。
- gate text 必须绑定 decision。
- custom decision 必须提交 `decision: "custom"`。
- Paused 禁用 submit。
- Delivered/Failed 只读。

验收：

- 每个 composer mode 有单元测试。
- gate options 只来自 projection。

### H. Swimlane Renderer

目的：多 agent 编排视图，不只是表格。

结构：

```text
Group / Agent | Plan | Act | Observe | Reflect | Status

Orchestrator
Requirement Group
  Intake
  Analyst
  Scorer
  Question Planner
  PRD Agent
Development Group
  Architect
  Planner
  Coding
  Review
  QA
  DevOps
Testing / Delivery
```

能力：

- active group 展开，历史 group 可折叠。
- active / gated / failed / retrying / paused / interrupted 状态可扫描。
- user message marker。
- gate marker。
- tool/test/diff chips。
- click cell selects run。
- selected run detail。
- chips deep link 到右侧 tab。

验收：

- 与 Stream 使用同一 projection。
- selected run 在模式切换后保留。
- 多 gate、failed run、interrupted slice 可见。

### I. Right Workspace

目的：承接检查、预览、命令、测试、报告，不解释主叙事。

Files：

- repo / artifacts 双 scope。
- file content read-only。
- diff patch。
- PRD / AC / tech plan / delivery report 版本序列。

Preview：

- preview URL。
- deployment URL。
- reachable。
- Playwright ready。
- console errors。
- empty reason。

Terminal：

- governed command。
- output/ref。
- risk grade。
- redaction status。
- 403 + gateId 就地 gate。
- 不硬编码 gate options。

Tests：

- per-slice checks。
- final:typecheck。
- final:build。
- final:vitest。
- final:playwright。
- QA notes。
- artifacts / traces。

Report：

- 9-section delivery report。
- emptyReason。
- risks and limitations。
- gate decisions。
- deployment URL。
- final acceptance result。

验收：

- 保持 exactly five tabs。
- 所有 tab 可从 Stream/Swimlane deep link。
- tab 可以懒加载 detail，但不能猜业务状态。

### J. Project Hub, Settings, Integrations

Project Hub：

- project list。
- lifecycle timeline。
- open gate summary。
- risk summary。
- preview/deployment summary。
- artifact cards。
- new/open/pause/resume/archive。
- 回退路径显示为 rework marker，不倒退时间线。

Settings：

- workspace paths。
- environment checks。
- engine readiness。
- API key readiness names only。
- degraded mode banner。
- mock mode banner。
- policies。
- Integrations entry。

Integrations：

- status：not_configured / connected / expired / offline_fallback / disabled。
- scopes。
- secret readiness names only。
- offline Skill Pack。
- mock badge。
- enable/call API path。

验收：

- Project Hub 不管理 secrets/settings。
- Settings 不管理项目。
- Integrations 缺凭据不展示假成功。

### K. Testing And Visual QA

测试层级：

1. Projection unit tests。
2. Composer mode tests。
3. Renderer tests。
4. Right tab tests。
5. Mode switching tests。
6. Playwright visual smoke。
7. Browser plugin manual QA。

必须增加的测试：

- all project statuses fixture。
- all gate types fixture。
- multi-gate blocking behavior。
- SSE cursor no rollback。
- strict seq timeline。
- Stream/Swimlane lossless switching。
- Paused disables mutating actions。
- Delivered/Failed read-only。
- PRD approve no Start Development button。
- Terminal uses returned gate options。
- Integrations mock badge。

视觉 QA：

- desktop 1440 x 1024。
- laptop 1280 x 720。
- mobile 390 x 844。
- Stream default。
- Swimlane mode。
- Paused state。
- Gate state。
- Long terminal/test output。

## 7. Milestones

当前状态：

| Milestone                      | Status      | Notes                                                                                           |
| ------------------------------ | ----------- | ----------------------------------------------------------------------------------------------- |
| M0 Planning And Audit          | Partial     | 核心文档和 UI v2 QA surface 已有，独立 `audit.md` 与完整截图集未完成                            |
| M1 Projection Contract         | Complete    | 游标、事件 taxonomy、composer mode、12 状态和 8 gate scenario matrix 已完成                     |
| M2 Component Foundation        | Complete    | local shared primitives、派生 token、GateCard 和 Workspace 基础组件已统一                       |
| M3 UI v2 Real Data Adapter     | Complete    | adapter、真实路由、fixture 路由和真实项目验证已完成                                             |
| M4 Stream And Composer         | Complete    | Current Work、严格 event timeline、分组历史和 state-driven composer 已接入                      |
| M5 Swimlane                    | Complete    | 分组、marker、deep link、event refs、interrupted 和短摘要已完成；retrying 等待后端信号          |
| M6 Right Workspace             | Complete    | 五个真实 API tab、empty/code/log/status 视觉、deep link 和 API gate options 已统一               |
| M7 Hub, Settings, Integrations | Partial     | UI v2 顶栏入口已接通；内容布局仍需完整重构                                                       |
| M8 Replace Default Console     | Not started | 当前仅 query flag / environment flag opt-in                                                     |
| M9 Cleanup And Governance      | Not started | legacy cleanup、AGENTS 和 lint governance 尚未执行                                              |

### M0: Planning And Audit

Deliverables:

- `docs/frontend/frontend-redesign-plan.md`
- `docs/frontend/audit.md`
- screenshot set of current UI and `/dev/ui-v2`

Exit gate:

- Known gaps are classified as projection, UI, or API issue.

### M1: Projection Contract

Deliverables:

- full projection types
- scenario fixtures
- complete event mapping
- no rollback SSE cursor

Exit gate:

- projection tests pass for all statuses and major event types.

### M2: Component Foundation

Deliverables:

- shared UI primitives or local wrappers
- no hardcoded palette in new UI components
- reusable GateCard, StatusPill, ComposerModeShell, PausedBanner

Exit gate:

- UI v2 shell uses shared components for repeated controls.

### M3: UI v2 Real Data Adapter

Deliverables:

- `ConsoleProjection -> UiV2ViewModel`
- `/projects/[id]?ui=v2`
- fixture mode still works

Exit gate:

- UI v2 renders a real project snapshot.

### M4: Stream And Composer

Deliverables:

- CurrentWorkPin
- strict timeline
- full event mapping
- state-driven composer

Exit gate:

- one full project flow can be followed in Stream without falling back to old UI.

### M5: Swimlane

Deliverables:

- grouped swimlane
- selected run detail
- cell chips and deep links
- lossless mode switching

Exit gate:

- active agent, failed run, gate, paused/interrupted state all visible in swimlane.

### M6: Right Workspace

Deliverables:

- polished five tabs
- deep links
- empty states
- terminal gate options from API

Exit gate:

- every stream/swimlane artifact can be inspected in the correct tab.

### M7: Hub, Settings, Integrations

Deliverables:

- Project Hub lifecycle + gates + risks
- Settings readiness + degraded/mock banners
- Integrations cards + mock badge

Exit gate:

- project management, global readiness, and connector readiness are separated.

### M8: Replace Default Console

Deliverables:

- UI v2 default at `/projects/[id]`
- old UI fallback behind flag for one release window
- visual regression screenshots

Exit gate:

- end-to-end smoke flow passes on UI v2.

### M9: Cleanup And Governance

Deliverables:

- remove obsolete old console code or isolate legacy fallback
- update `AGENTS.md`
- add lint checks for hardcoded colors and forbidden UI patterns

Exit gate:

- future frontend work starts from docs + projection + design system.

## 8. Rollout Strategy

Use a parallel route strategy:

1. `/dev/ui-v2`: fixture and visual QA.
2. `/projects/[id]?ui=v2`: real data, opt-in.
3. `NEXT_PUBLIC_OC_UI_V2=1`: environment default.
4. `/projects/[id]`: UI v2 default.
5. legacy fallback removed after acceptance.

Rollback:

- If UI v2 blocks real workflows, switch flag back to old console.
- Projection changes should remain because they are additive and tested.

## 9. Implementation Order

Do not start with component polish. Start with projection truth.

```text
audit
-> projection fixtures
-> projection builder
-> component primitives
-> UI v2 adapter
-> stream/composer
-> swimlane
-> right workspace
-> hub/settings/integrations
-> visual regression
-> default route switch
```

## 10. Definition Of Done

Frontend redesign is complete only when:

- All 12 project statuses render correctly.
- All 8 gate types render with API-provided options.
- Stream timeline is strict `seq`.
- CurrentWorkPin does not mutate timeline ordering.
- Composer mode is fully state-driven.
- Paused disables mutating actions.
- Delivered / Failed are read-only.
- Stream and Swimlane share one projection.
- Right workspace has exactly five tabs.
- Integrations show mock and missing-secret states honestly.
- No new UI code relies on hardcoded palette.
- Desktop and mobile screenshots pass visual QA.
- Old UI fallback is no longer needed for core workflows.

## 11. Completed Implementation Slices

### Slice 1: Projection Reliability

Completed:

1. Fixed SSE cursor no-rollback.
2. Added event deduplication and `seq` sorting.
3. Extended timeline taxonomy for the shared event schema.
4. Added composer projection modes.
5. Removed `PRD Ready -> Start development` from UI v2/new path.
6. Added projection and composer tests.

### Slice 2: UI v2 Real Data Integration

Completed:

1. Added `ConsoleProjection -> UiV2Projection` adapter.
2. Added `UiV2Console` live container.
3. Added `/projects/[id]?ui=v2` and `NEXT_PUBLIC_OC_UI_V2=1` opt-in.
4. Kept `/dev/ui-v2` fixture mode.
5. Connected live pause/resume, deploy, composer and gate APIs.
6. Connected the five existing Right Workspace API tabs.
7. Added live empty states, dynamic selected run fallback and latest-suite test aggregation.
8. Verified a real Developing project on desktop and mobile.

### Slice 3: Runtime Density And Timeline Contract

Completed:

1. Added an explicit UI v2 `CurrentWork` contract outside Event History.
2. Restricted Event History to real projected events and rendered it in ascending `seq` order.
3. Grouped historical runs by agent group and collapsed completed history by default.
4. Added bounded incremental expansion for runs and earlier events.
5. Preserved selected run, workspace tab and per-mode scroll position.
6. Normalized historical run status so only current work appears active or gated.
7. Added adapter and shell tests for boundaries, ordering, incremental loading and mode restoration.
8. Verified the real project on desktop and 390px mobile without horizontal overflow.

### Slice 4: Scenario Matrix And State Safety

Completed:

1. Added valid projection fixtures for all 12 project statuses.
2. Added all 8 gate fixtures using registry-defined options and a multiple-open-gates scenario.
3. Added `/dev/ui-v2?scenario=...` rendering for regression and visual QA.
4. Added a global Paused banner and disabled composer, gate and deploy mutations while paused.
5. Projected the active Paused run as `interrupted` instead of running, gated or failed.
6. Limited Deploy to Testing and disabled Pause for Draft, Delivered and Failed.
7. Added Delivered/Failed read-only, query flag and environment flag tests.
8. Fixed duplicate React keys in repeated test result rows.

Deferred contract item:

- `retrying` requires an authoritative attempt/retry field or event from the backend. It is not inferred from `run.failed` because that would misrepresent terminal failures as retries.

### Slice 5: Swimlane Completion

Completed:

1. Grouped Swimlane rows by Requirement and Development ownership with collapsible group headers.
2. Expanded active, gated, interrupted and failed groups while keeping completed history compact.
3. Added user and gate timeline markers that return to the source Stream.
4. Added tool, diff, test and report icon deep links to the five-tab workspace.
5. Added selected-run event sequence references and expandable full P/A/O/R summaries.
6. Added deterministic two-line cell summaries capped for dense desktop and mobile scanning.
7. Fixed Requirement Agent classification for completeness scorer and PRD acceptance runs.
8. Added the Agent-native / small-model summary evolution contract in `swimlane-summary-contract.md`.

Deferred contract item:

- `retrying` remains blocked on a backend attempt/retry signal.

## 12. Next Implementation Slices

### Slice 6: UI Foundation And Workspace Polish

Completed:

1. Added shared UI v2 primitives for buttons, icon buttons, tabs, panels, status pills, inputs, empty states and code/log blocks.
2. Added derived `--oc-*` tokens for code surfaces, active borders, info state and modal overlay.
3. Re-skinned Files, Preview, Terminal, Tests and Report without changing their backend data contracts.
4. Re-skinned the shared GateCard and removed hardcoded palette/tracking patterns from UI v2 Workspace components.
5. Changed Terminal gate handling to fetch authoritative options from the open-gates API by `gateId`.
6. Added Project Hub and Settings top-nav entries, preserved the UI v2 query when switching projects, and retained Deploy disabled reasons and the Paused banner.
7. Added primitive, top-nav and terminal gate-option regression tests.

### Slice 7: Hub, Settings, Integrations And Rollout

Priority: next.

1. Redesign Project Hub, Settings and Integrations.
2. Add visual regression scenarios for status/gate/mobile/long-output states.
3. Make UI v2 the default route after acceptance.
4. Keep legacy fallback for one release window, then remove obsolete console code.
