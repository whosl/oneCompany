# Agent Orchestration UI

## 核心模型

OneCompany 前端以 `Orchestrator Agent` 为用户入口。

```text
User
  <-> Orchestrator Agent
        -> Requirement Group
             -> Intake Agent
             -> Requirement Analyst Agent
             -> Completeness Scorer Agent
             -> Question Planner Agent
             -> PRD And Acceptance Agent
        -> Development Group
             -> Architect Agent
             -> Test Designer Agent
             -> Planner Agent
             -> Coding Agent
             -> Review Agent
             -> QA Agent
             -> DevOps And Delivery Agent
```

`Orchestrator Agent` 可以是明确的后端 agent，也可以先作为前端投影层中的 synthesized actor。无论实现路径如何，用户界面中都应该把它作为主对话对象呈现。

Orchestrator 的 UI 表达不能绕过项目状态机。它可以解释、汇总、路由和提示下一步，但状态转换合法性、gate policy、risk grade、authoritative test result 必须来自后端状态机和 projection。

## UI 实体

### Orchestrator Agent

职责：

- 接收用户输入。
- 解释当前状态。
- 拉起 requirement group 或 development group。
- 汇总子 agent 输出。
- 提示用户下一步可做什么。
- 暴露 open gate。
- 在 composer 中解释当前输入模式：需求、问题回答、gate、变更、部署 URL、验收或只读。

展示方式：

- 在 `Orchestration Strip` 中常驻。
- 在 Stream 中以主线消息或 handoff card 出现。
- 在 Swimlane 中作为 group header 或 top row 出现。

### Agent Group

`Requirement Group` 和 `Development Group` 是主流程段。

每个 group card 展示：

- group name
- goal
- active child agent
- progress
- current status
- latest output
- open blocker

group 可折叠。历史 group 默认 compact，当前 group 默认 expanded。

### Child Agent

子 agent 是实际执行者。

每个 child agent 至少展示：

- name
- group
- role
- model tier，如果后端提供
- tools summary，如果后端提供
- permissions/risk level，如果后端提供
- current run status

### Agent Run

一次 agent run 是可展开的工作单元。

字段来自事件和 durable state：

- `runId`
- `agentId`
- `correlationId`
- start/end time
- status
- Plan summary
- Act summary
- Observe summary
- Reflect summary
- tool calls
- command outputs
- diffs
- test results
- artifacts
- errors

如果当前事件模型没有 parent/child run 字段，前端先用 `correlationId`、`agentId`、`runId` 和事件顺序聚合。后续可以在事件模型中增加 `parentRunId` 或 `groupId`，但不能让前端依赖第二套业务状态。

Run 聚合不能改变事件时间序。Stream 中 run card 是视觉折叠；事件仍按 `seq` 排列。当前 run 可以进入 `Current Work Pin`，但 timeline 本体不能被重排。

## 状态语义

推荐状态：

| 状态 | 用途 |
| --- | --- |
| idle | agent 尚未开始或等待进入 |
| running | agent 正在执行 |
| streaming | 正在实时输出 |
| waiting | 等待其他 agent、工具或测试 |
| gated | 等待用户 gate decision |
| retrying | 重试中 |
| succeeded | 当前步骤完成 |
| warning | 有风险、跳过、降级或非阻塞失败 |
| failed | 当前步骤失败 |
| paused | 项目暂停 |

颜色语义：

- success: 已完成、已确认、测试通过。
- warning: 需要注意、待确认、非阻塞风险。
- danger: 失败、高风险、不可继续。
- accent: 当前 active、主要操作、当前 slice。
- muted: 历史、等待、未开始。

## Stream 中的呈现

Stream 应该按以下层级呈现：

```text
Orchestrator message
Group card
  Child agent run
    Plan
    Act
      Tool call
      Command output
      Diff
    Observe
      Test result
    Reflect
Gate card
User response
```

默认折叠规则：

- 当前 active run 展开。
- completed run 折叠为一行 summary。
- verbose tool output 折叠。
- failed / gated / risk item 自动展开到能理解问题的最小信息。
- 用户可以 expand all / collapse all。

## Swimlane 中的呈现

Swimlane 是同一投影的矩阵表达。

推荐分组：

```text
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
```

列：

- Plan
- Act
- Observe
- Reflect
- Status

cell 内容：

- 最新 summary
- tool/test/diff chips
- duration
- retry count
- risk/gate marker
- handoff marker

用户点击 cell 后，左侧可以打开 run detail，右侧对应跳转到 Files / Terminal / Tests / Report。

## Gate 呈现

gate 是一等公民，不是普通消息。

gate card 必须展示：

- gate type
- why it blocks
- allowed decisions
- risk level
- affected workflow state
- custom input
- audit link
- command/tool metadata，如果 gate 来自 dangerous operation
- blocking / non-blocking status

已解决 gate 折叠成 historical decision chip：

```text
HUMAN GATE · RESOLVED
Approved · you · 2 minutes ago
View decision log
```

多 gate 规则：

- `openGates` 可能多于一个。
- `blockingGateId` 接管 composer。
- 非 blocking gate 在 Stream / Project Hub 中保持可发现。
- gate options 直接使用后端返回值，不能硬编码。
- high-risk dangerous operation 不显示 `skip_risk_and_continue`，除非后端 policy 显式返回。

## Composer 与项目状态

Composer 是 Orchestrator 与用户的统一入口，但具体 mode 由项目状态决定：

| 状态 | Composer 行为 |
| --- | --- |
| `Draft Requirement` | 收一句话需求 |
| `Asking Questions` | 一轮问题回答 |
| `PRD Ready` / `Tech Plan Review` / `Change Review` / `Awaiting Acceptance` | gate 决策 |
| `Developing` / `Testing` | 变更请求 |
| `Deploying` | 部署 URL + gate 决策 |
| `Delivered` / `Failed` | 只读 |
| `Paused` | 禁用，等待 Resume |

free text 不能作为隐式批准。gate 场景下的文本必须绑定到明确 decision。

## 禁止事项

- 不把 hidden chain-of-thought 暴露给用户。
- 不把 free terminal 当作绕过 gate 的后门。
- 不让 stream 和 swimlane 各自维护不同状态。
- 不用前端猜测非法状态转移。
- 不把 opencode 的自报测试结果当成 authoritative pass/fail；前端应展示 OneCompany 自己的 authoritative test result。
- 不为了突出 active run 改变 timeline 的 `seq` 顺序。
- 不在 Paused 状态下允许 gate resolve、command run 或 change request submit。
