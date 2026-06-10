# UI v2 Screen Spec

## Final Direction

UI v2 默认采用 `Stream Mode`，并提供一键切换到 `Swimlane Mode`。

设计组合：

- 默认体验：Agent Command Center。
- 泳道体验：Mission Control Swimlane。
- 配色：继续使用当前 `--oc-*` token 方案。
- 数据：继续使用现有 API、SSE event log、durable state snapshot、gate、files、tests、preview、report。

## Screen Map

```text
Top Navigation
Main Console
  Left Agent Console
    Orchestration Strip
    Mode Switcher
    Stream Mode (default)
      Stream Header / Requirement Snapshot
      Timeline Items
      Inline Gate
      Sticky Composer
    Swimlane Mode (alternate)
      Grouped Swimlane Board
      Selected Run Detail
  Right Project Workspace
    Workspace Header
    Files | Preview | Terminal | Tests | Report
Project Hub Modal
Settings Modal
Integrations Page
```

## 0. Business State Contract

UI v2 必须是状态机驱动的控制台，不是只渲染事件的日志页面。

### Project Status

前端必须支持这些精确状态：

| Status | UI phase | Primary user surface |
| --- | --- | --- |
| `Draft Requirement` | Requirement | requirement composer |
| `Asking Questions` | Requirement | question cards + answer composer |
| `PRD Ready` | Requirement | `requirement_confirm` gate |
| `Tech Plan Review` | Development | `tech_plan_confirm` gate |
| `Developing` | Development | slice progress + agent activity + change request composer |
| `Change Review` | Development | `change_review` gate |
| `Testing` | Testing | final suite progress + preview + optional change request |
| `Deploying` | Deployment | deployment URL composer + deployment gate |
| `Awaiting Acceptance` | Delivery | delivery report + `final_acceptance` gate |
| `Delivered` | Delivery | read-only delivery report |
| `Failed` | Terminal | read-only failure reason |
| `Paused` | Suspended | global paused banner + disabled composer/gates |

### M13 Target Behavior

新 UI 按 M13 目标行为设计，不适配当前已知错误：

- approve PRD 后自动进入 `Tech Plan Review`，不再显示手动“开始开发”作为主路径。
- `Testing -> Change Review -> Testing` 是合法路径。
- deployment gate reject 回到 `Testing`。
- Pause 是硬中断：展示全局 paused banner、禁用 composer/gate 操作、支持 `interrupted` slice 状态。
- 信息流必须覆盖 deployment、change request、artifact、run.failed、reflect 事件。
- SSE 游标恢复使用 `max(currentSeq, snapshot.lastSeq)`。
- dangerous operation gate 必须展示命令/工具 metadata。

### Current Work Pin vs Timeline

界面可以在 Stream 顶部显示 `Current Work Pin`，突出 active run、blocking gate 和 next action。

但真正的 `Timeline Items` 必须严格按 event `seq` 时间序渲染。不能为了突出当前状态重排历史事件；置顶摘要是 projection 派生视图，不是事件流本身。

## 1. Top Navigation

### 功能

提供跨项目、跨流程的全局上下文和全局动作。

### 展示内容

- Product mark: `OneCompany`。
- Project switcher: 当前项目名、版本或 slug。
- Status pill: 当前 project status，例如 `Developing`。
- Active group pill: `Requirement Group` / `Development Group` / `Testing` / `Delivery`。
- Progress pill: 当前阶段进度，例如 `Slice 2 / 3`、`Question round 3 / 6`。
- Blocker pill: 有 open gate 时展示 `Gated`、`High risk`、`Awaiting approval`。
- Run control: Pause / Resume。
- Deploy entry。
- Avatar / Settings entry。
- Paused banner，项目为 `Paused` 时出现在 top nav 下方或主内容上方。

### 展示逻辑

- 状态 pill 必须来自 durable project status。
- active group 来自 projection，不允许前端根据最近一条事件猜测非法状态。
- progress 必须匹配当前 lifecycle phase。
- requirement completeness 在 development 阶段只能作为历史指标，不作为 active progress。
- blocker pill 只提示阻塞，具体决策必须在 inline gate card 或 composer options 完成。
- Deploy 只在业务允许时可执行；不可用阶段必须给出 tooltip/reason，不允许静默禁用。
- `Paused` 状态下所有 mutating action 禁用，Resume 保持可用。

### 交互

- Project switcher 打开 compact menu 或 Project Hub。
- Pause / Resume 调用项目状态动作。
- Deploy 打开 deployment gate 或 deployment summary。
- Avatar 打开 Settings。

## 2. Left Agent Console

左侧是主产品面。它解释 OneCompany 正在如何使用多个 agent 交付项目。

## 2.1 Orchestration Strip

### 功能

首屏最高优先级地回答：

- 谁在指挥？
- 当前拉起了哪个 group？
- 哪个 child agent 正在执行？
- 当前卡在哪里？
- 用户下一步能做什么？

### 展示内容

推荐结构：

```text
Orchestrator Agent
  -> Development Group
    -> Coding Agent

Slice 2 / 3 · Act · dangerous_operation gate
Next: Approve command / Revise instruction / Reject
```

展示项：

- Orchestrator status。
- Active group。
- Active child agent。
- Current phase: Plan / Act / Observe / Reflect / Gate / Testing。
- Current unit: question round、slice、test suite、deployment。
- Open blocker。
- Next allowed user action。

### 展示逻辑

- Stream 和 Swimlane 共用这一块。
- 如果没有 active child agent，显示 group-level state。
- 如果 workflow idle，显示 next start action。
- 如果 gate open，strip 进入 warning/gated 状态。
- 如果 failed，strip 进入 danger 状态并指向失败事件。

### 交互

- 点击 active agent 定位到当前 run。
- 点击 blocker 定位到 inline gate。
- 点击 progress 打开 Project Hub lifecycle 或 run list。

## 2.2 Mode Switcher

### 功能

切换同一 projection 的两种观察方式。

### 展示内容

- `Stream` 默认 active。
- `Swimlane` 可切换。
- 可显示 unread/active marker，例如 Swimlane 上有 failed cell 或 gated marker。

### 展示逻辑

- 切换不改变数据。
- 切换不重新请求业务状态。
- selected run、open gate、right workspace deep link 尽量保留。

## 2.3 Stream Mode 默认

### 功能

用时间线叙事解释项目从用户输入到 agent 执行的全过程。

### 展示内容

#### Stream Header / Requirement Snapshot

- raw requirement link。
- normalized requirement summary。
- requirement completeness 历史分数。
- 已确认 facts。
- upcoming required action。

#### Timeline Items

按时间从上到下展示：

- user message。
- orchestrator message。
- group start / complete。
- child agent run。
- Plan / Act / Observe / Reflect segment。
- tool call。
- command output。
- diff summary。
- authoritative test result。
- artifact created。
- status changed。
- risk warning。
- gate created / resolved。
- deployment started / URL confirmed / completed。
- change request created / resolved。
- run failed。

#### Agent Run Card

每个 child agent run 是一个可展开对象：

```text
Coding Agent · Slice 2 / 3 · running
Plan      one-line summary
Act       active, expanded
Observe   compact
Reflect   pending

tools: shell.run, file.write
diff: +86 lines
tests: 1 failed / 4 passed
```

### 展示逻辑

- 当前 active run 展开。
- 已完成 run 自动 compact。
- 信息流严格按 `seq` 时间序；active run 可通过 `Current Work Pin` 置顶提示，但 timeline 本体不重排。
- 阶段切换插入阶段分隔线。
- verbose output 默认折叠。
- failed / gated / high-risk item 必须展开到能理解原因。
- user-originated 和 agent-originated 视觉区分明显。
- raw requirement 和 normalized requirement 必须分开。
- 不展示 hidden chain-of-thought，只展示计划、观察、反思摘要和审计结果。
- 用户位于底部时 auto-scroll；用户上翻后暂停 auto-scroll，并显示 `Jump to latest`。

### 交互

- 展开/折叠 run。
- 展开 tool call 参数和结果摘要。
- command output 跳转 Terminal。
- diff 跳转 Files。
- test result 跳转 Tests。
- artifact 跳转 Report 或 Files。
- gate card 就地处理或绑定 composer。

## 2.4 Inline Gate

### 功能

表达 workflow 被人类决策阻塞。

### 展示内容

- gate type。
- why blocked。
- risk level。
- affected workflow state。
- allowed decisions。
- custom input。
- audit link。
- gate metadata，例如 command、tool、risk reason、affected slice/run。

示例 dangerous operation gate：

```text
Dangerous operation
Coding Agent wants to run: npm install <package>
Risk: High external download

[Approve command] [Revise instruction] [Reject]
Custom instruction...
```

### 展示逻辑

- 同一时刻最多一个 blocking gate 强强调。
- `openGates` 可以多于一个；composer 只接管 `blockingGateId`，其余 gate 可在信息流中就地处理或折叠显示。
- 历史 gate 折叠为 decision chip。
- allowed decisions 必须来自 gate policy。
- `Skip risk and continue` 只在 spec 允许的低/中风险 operation gate 出现。
- high risk dangerous operation gate 必须阻断式呈现，展示命令原文和风险原因。
- gate resolve 后必须写入 event log，并在 Stream/Report 中可追溯。

### 交互

- 选择 decision。
- 输入 custom instruction。
- 提交后 gate resolved 并写入 event log。

## 2.5 Sticky Composer

### 功能

用户对 Orchestrator 的统一输入口。

### 模式

Composer 是状态机驱动的多模态输入口，模式由 `project.status + blockingGate` 决定。

| Status / condition | Composer mode |
| --- | --- |
| `Draft Requirement` | one-sentence requirement input |
| `Asking Questions` | question answer form, one round submit |
| `PRD Ready` | `requirement_confirm` gate decisions |
| `Tech Plan Review` | `tech_plan_confirm` gate decisions |
| `Developing` | change request input unless blocking gate exists |
| `Change Review` | `change_review` gate decisions |
| `Testing` | change request input, with testing status context |
| `Deploying` | deployment URL input + deployment gate decisions |
| `Awaiting Acceptance` | `final_acceptance` gate decisions |
| `Delivered` / `Failed` | read-only |
| `Paused` | disabled, Resume action only outside composer |

### 无 gate 时

展示：

- free text input。
- intent selector 或 lightweight options：answer question、supplement requirement、change request、acceptance note。
- Send。

提交逻辑：

- 根据当前 phase 选择 API：requirement answer、change request、final acceptance note 等。
- Developing / Testing 的普通 free text 默认是 change request，不是 agent 直接指令。
- Asking Questions 必须支持 A/B/C/D 选择和整轮提交，提交前可修改任意题。

### 有 gate 时

展示：

- gate allowed decisions。
- custom text。
- Send / Resolve。

提交逻辑：

- free text 必须绑定到一个 allowed decision。
- 不能把纯文本当作 implicit approval。
- 如果 gate 允许 custom decision，custom text 必须作为该 decision 的参数提交。
- 如果存在多个 open gates，composer 显示 blocking gate；其他 gate 在信息流内显示 compact controls 或 deep link。

## 2.6 Swimlane Mode

### 功能

用 agent x phase 的矩阵展示多 agent 编排、并行、等待、失败和交接。

### 展示内容

分组：

- Orchestrator。
- Requirement Group。
- Development Group。
- Testing / Delivery，必要时显示为 group section。

列：

- Plan。
- Act。
- Observe。
- Reflect。
- Status。

行：

- Orchestrator Agent。
- Intake。
- Analyst。
- Scorer。
- Question Planner。
- PRD Agent。
- Architect。
- Planner。
- Coding。
- Review。
- QA。
- DevOps。

cell 内容：

- latest summary。
- status indicator。
- tool/test/diff chips。
- duration。
- retry count。
- gate marker。
- handoff arrow。

### 展示逻辑

- active group 展开，历史 group 可折叠。
- active cell 使用 accent emphasis。
- failed cell 使用 danger。
- gated/waiting cell 使用 warning。
- completed cell compact。
- pending cell muted。
- user message 和 gate 作为 marker，不能从泳道消失。

### 交互

- 点击 cell 选中 run。
- 选中后显示 selected run detail。
- 双击或 command-click 可跳转到 Stream 中对应事件。
- cell 中的 diff/test/tool chip 可跳转右侧 workspace。

## 2.7 Selected Run Detail

### 功能

在 Swimlane 中补足单个 cell 无法展示的细节。

### 展示内容

- agent name。
- runId / correlationId。
- current step。
- Plan / Act / Observe / Reflect summaries。
- tools。
- command output summary。
- diffs。
- authoritative tests。
- artifacts。
- open gate 或 resolved decision。

### 展示逻辑

- Stream 模式可以不常驻 detail，因为 run card 已展开。
- Swimlane 模式需要 detail 面板或底部 inspector。
- detail 只读，动作仍通过 gate/composer/right workspace 触发。

## 3. Right Project Workspace

右侧用于检查产物、运行结果和交付物。它不解释 workflow 主叙事，但承接左侧 deep link。

## 3.1 Workspace Header

### 展示内容

- workspace title。
- generated project path。
- active tab。
- health/status compact summary。

### 展示逻辑

- title 跟随当前 project。
- 如果左侧 deep link 到某个 tab，header 可显示 source item，例如 `From Coding Agent / Act`。
- 每个 tab 的数据源和刷新策略必须可见于实现代码或 projection adapter，不允许 tab 自行猜状态。

## 3.2 Files Tab

### 功能

查看生成项目源码、artifacts 和 diffs。

### 展示内容

- repo tree。
- artifacts tree。
- selected file content。
- selected diff。
- linked agent run / slice metadata。
- repo / artifacts 双 scope。
- PRD、acceptance criteria、tech plan、delivery report 版本序列。

### 展示逻辑

- read-only。
- diff 优先展示与 selected run 相关的文件。
- 大文件可摘要或 lazy load。
- 不允许 Files tab 直接编辑源文件。

## 3.3 Preview Tab

### 功能

检查 generated app 的本地预览或 deployment。

### 展示内容

- active URL。
- preview surface。
- health strip：reachable、Playwright ready、console errors。
- deployment URL，如果存在。
- empty reason，如果当前状态尚无 preview。

### 展示逻辑

- 没有 preview 时显示明确 empty state。
- preview failure 跟 Tests/Terminal 形成 deep link。
- preview status 建议轮询 `GET .../preview/status`，同时响应相关 SSE event。

## 3.4 Terminal Tab

### 功能

查看和执行受治理的项目命令。

### 展示内容

- command input。
- command output。
- risk grade。
- redaction status。
- linked tool_call events。
- 403 + gateId 时的就地 gate 卡。

### 展示逻辑

- low/medium command 可执行并记录。
- high-risk command 触发 gate。
- 所有输出进入 log/redaction/chunking pipeline。
- Terminal 不能绕过 gate policy。

## 3.5 Tests Tab

### 功能

显示 authoritative test result。

### 展示内容

- per-slice checks。
- final acceptance suite。
- TypeScript。
- Vitest。
- Build。
- Playwright。
- Acceptance。
- failing trace。
- artifact links。

### 展示逻辑

- opencode 内部测试只能作为 informational event。
- 状态转移依据 OneCompany 自己跑的 authoritative test。
- per-slice 和 final suite 必须分区。
- final suite 至少覆盖 `final:typecheck`、`final:build`、`final:vitest`、`final:playwright`。
- 任一 final suite 失败时展示 QA notes 和回到 `Developing` 的状态原因。

## 3.6 Report Tab

### 功能

展示交付物和审计结果。

### 展示内容

- PRD。
- acceptance criteria。
- tech plan。
- run instructions。
- delivery report。
- risk summary。
- gate decisions。
- preview/deployment URL。
- final acceptance。
- delivery report 9 个固定 section：
  `requirement-summary`、`confirmed-tech-stack`、`feature-list`、`directory-structure`、`run-instructions`、`test-results`、`deployment-url`、`risks-and-limitations`、`follow-up-recommendations`。

### 展示逻辑

- 不造假 placeholder data。
- 未生成的 section 显示 empty state 或不展示。
- forced continue、skip risk、skip slice/change review 必须进入 risk summary。
- 空 section 使用 `emptyReason`，不展示伪造内容。

## 4. Project Hub

### 功能

多项目管理。

### 展示内容

- search。
- filters。
- project list。
- selected project detail。
- lifecycle timeline。
- open gate summary。
- risk summary。
- preview/deployment summary。
- artifact cards。
- Open / Pause / Resume / Archive / New Project。

### 展示逻辑

- Project Hub 是项目管理，不是 settings。
- compact project dropdown 和 Project Hub 互斥。
- lifecycle timeline 必须覆盖 Draft -> Delivered 全路径。

## 5. Settings

### 功能

全局环境 readiness。

### 展示内容

- workspace paths。
- generated projects root。
- API key readiness。
- Cloudflare readiness。
- Node / pnpm / Git / Docker / SQLite / Playwright checks。
- read-only policy chips。

### 展示逻辑

- 不显示 secret values。
- 不配置 model routing。
- 不配置 sandbox policy。
- 不管理项目。

## 6. Integrations Page

### 功能

管理外部连接器的就绪状态和离线 Skill Pack 兜底。

### 展示内容

- integration display name。
- status pill：`not_configured` / `connected` / `expired` / `offline_fallback` / `disabled`。
- scopes。
- secret readiness，只显示 secret 名称，不显示值。
- linked offline Skill Pack。
- project-level integration state，如果后端提供。

### 展示逻辑

- mock 模式必须显示 `[MOCK]` 或“模拟数据”徽章。
- 缺凭据时显示 `not_configured` 和配置引导，不展示假成功。
- 连接器 enable/call 交互必须走后端 integration API，不在前端伪造成功。

## 7. Data And State Ownership

### 前端可以拥有

- selected mode。
- selected run。
- expanded/collapsed UI state。
- selected right tab。
- split pane width。
- scroll position。
- pending composer draft。
- user viewport preference。

### 前端不能拥有

- workflow status。
- project status transition result。
- gate policy。
- gate allowed decisions。
- risk grade truth。
- authoritative test result。
- status transition legality。
- hidden agent reasoning。
- deployment URL validity。
- integration truth state。

## 8. Initial Implementation Slice

第一版 UI v2 可以按这个最小闭环实现：

1. 新 app shell。
2. Top nav。
3. Orchestration Strip。
4. 状态机驱动的 composer mode fixture。
5. Stream Mode 默认视图，包含 Current Work Pin + 严格 seq timeline。
6. Swimlane Mode 切换视图。
7. Inline gate / multi-gate fixture。
8. Right Workspace tab shell。
9. Paused / Failed / Delivered 只读或禁用状态 fixture。
10. Projection fixture 驱动的 Story/UI catalog。

真实 API 接线在 projection 稳定后逐步替换 fixture。
