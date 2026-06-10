# Stream And Swimlane Contract

## 原则

Stream Mode 和 Swimlane Mode 是同一份 projection 的两个 renderer。

```text
Event log + durable state snapshot
  -> frontend projection
      -> Stream renderer
      -> Swimlane renderer
```

不允许：

- Stream 有自己的状态 store。
- Swimlane 有另一套状态 store。
- 切换视图时重新解释业务流程。
- 某些事件只在一个视图可见。

## 输入来源

Projection 输入包括：

- SSE event stream。
- project durable state snapshot。
- requirement state。
- dev state。
- testing / deployment / delivery state。
- open gates。
- files / diffs / test results / artifacts metadata。
- integrations readiness metadata，如果当前页面需要显示。

事件是 audit 和 UI streaming source；durable state 是 control source。

## Ordering And Cursor Rules

Timeline ordering 必须由 event envelope 的 `seq` 决定。

- Stream timeline 永远按 `seq` 升序渲染。
- Run 分组只能做视觉折叠，不能改变事件顺序。
- 当前 active run / blocking gate 可以出现在 `Current Work Pin`，但这不是 timeline 的一部分。
- snapshot hydrate 后继续订阅 SSE 时，游标必须使用 `max(currentSeq, snapshot.lastSeq)`，避免旧快照回退。
- `project.status_changed` 应渲染为阶段分隔线，而不是从 timeline 中丢弃。

## Projection View Model

前端可以维护一个只读 view model：

```ts
type AgentProjection = {
  project: ProjectSnapshot;
  phase: PhaseSnapshot;
  orchestrator: OrchestratorSnapshot;
  groups: AgentGroupSnapshot[];
  runs: AgentRunSnapshot[];
  timeline: TimelineItem[];
  swimlane: SwimlaneModel;
  openGates: GateSnapshot[];
  blockingGateId?: string;
  nextUserAction?: UserActionHint;
  currentWork?: CurrentWorkSnapshot;
  rightWorkspace: RightWorkspaceProjection;
  lastSeq: number;
};

type PhaseSnapshot = {
  status:
    | "Draft Requirement"
    | "Asking Questions"
    | "PRD Ready"
    | "Tech Plan Review"
    | "Developing"
    | "Change Review"
    | "Testing"
    | "Deploying"
    | "Awaiting Acceptance"
    | "Delivered"
    | "Failed"
    | "Paused";
  activeGroup?: "requirement" | "development" | "testing" | "deployment" | "delivery";
  progressLabel?: string;
  pausedFrom?: string;
};

type AgentRunSnapshot = {
  runId: string;
  agentId: string;
  group: "orchestrator" | "requirement" | "development" | "testing" | "delivery";
  status: AgentRunStatus;
  startedAt?: string;
  endedAt?: string;
  steps: {
    plan?: AgentStepSnapshot;
    act?: AgentStepSnapshot;
    observe?: AgentStepSnapshot;
    reflect?: AgentStepSnapshot;
  };
  toolCalls: ToolCallSummary[];
  commandOutputs: CommandOutputSummary[];
  diffs: DiffSummary[];
  tests: TestResultSummary[];
  artifacts: ArtifactSummary[];
  errors: ErrorSummary[];
};

type RightWorkspaceProjection = {
  files: FileSummary[];
  diffs: DiffSummary[];
  preview?: PreviewSummary;
  terminal?: TerminalSummary;
  tests: TestResultSummary[];
  report?: DeliveryReportSummary;
};
```

这个 model 是渲染层数据，不是业务控制状态。

## Timeline Item Taxonomy

Stream renderer 使用统一 taxonomy：

| Type | Origin | 示例 |
| --- | --- | --- |
| user_message | user | 原始需求、追问回答、change request |
| orchestrator_message | agent | 下一步说明、group handoff、结果汇总 |
| group_event | system | Requirement Group started |
| agent_run | agent | Coding Agent run |
| agent_step | agent | Plan / Act / Observe / Reflect |
| tool_call | agent/system | shell、file、opencode permission |
| command_output | system | terminal output |
| diff | system | changed files summary |
| test_result | system | authoritative check result |
| gate | gate | tech_plan_confirm、dangerous_operation |
| artifact | system | PRD、report、trace、screenshot |
| change_request | user/system | requirement change、skip slice |
| deployment | system/gate | deployment started、URL confirmed、completed |
| risk | system | high-risk operation、forced continue |
| run_failed | system | agent run failed、slice exhausted |
| status_change | system | Developing -> Testing |

每个 item 必须能追溯到原始 event envelope 或 snapshot source。

## Stream Renderer Rules

- 默认 newest at bottom。
- timeline 严格按 `seq` 升序。
- 用户滚动到最底部时 auto-scroll。
- 用户向上滚动时暂停 auto-scroll，显示 jump to latest。
- 阶段切换显示分隔线。
- 当前 active run 展开。
- completed run 折叠。
- verbose output 折叠到 artifact link 或 terminal link。
- failed / gated / risk item 展开到可理解原因。
- user-originated item 和 agent-originated item 视觉上不能混淆。
- raw requirement 和 normalized requirement 必须区分。
- gate card inline 显示，但 composer 的 gate options 必须与同一 gate policy 一致。
- deployment、change_request、artifact、run.failed、reflect 事件不能丢。
- `Current Work Pin` 可以突出当前状态，但不能改变 timeline 事件顺序。

## Swimlane Renderer Rules

Swimlane 使用同一 projection 的 `runs` 和 `groups`。

行：

- Orchestrator。
- Requirement Group header。
- Requirement child agents。
- Development Group header。
- Development child agents。

列：

- Plan。
- Act。
- Observe。
- Reflect。
- Status。

cell：

- 展示最新 step summary。
- active cell 强调。
- completed cell compact。
- failed cell danger。
- waiting/gated cell warning。
- tool/test/diff 以 chips 显示。
- user messages 和 gates 作为 markers，不能丢失。
- 如果项目处于 `Paused`，所有 active cell 进入 paused/disabled 表达，并保留 pausedFrom。
- `interrupted` slice 应区别于 failed，使用中性 warning/muted 表达。

## Gate Projection Rules

- `openGates` 来自后端 gate API / snapshot，不由前端从事件猜测。
- `blockingGateId` 决定 composer 接管哪个 gate。
- 非 blocking open gate 仍必须在 Stream 中可发现，并可 deep link。
- gate options 必须直接渲染后端返回值，不能硬编码。
- dangerous operation gate 必须携带并展示 command/tool metadata、riskLevel、affected run/slice。
- resolved gate 在 timeline 中保留 decision record，并进入 Report/risk summary。

## Composer Projection Rules

Composer mode 由 `phase.status + blockingGateId` 决定。

| Condition | Mode |
| --- | --- |
| no project requirement submitted | requirement input |
| `Asking Questions` | question round answer form |
| blocking gate exists | gate decision form |
| `Developing` / `Testing` | change request form |
| `Deploying` | deployment URL + gate form |
| `Delivered` / `Failed` | read-only |
| `Paused` | disabled |

Composer draft 是 UI state；提交后的业务结果必须来自 API/SSE/snapshot 回放。

## Lossless Switching Checklist

切换 Stream -> Swimlane -> Stream 必须满足：

- event count 不变。
- open gate 不变。
- blocking gate 不变。
- user messages 可发现。
- active agent 不变。
- active group 不变。
- failed/retry/gated 状态不变。
- paused/interrupted 状态不变。
- expanded/collapsed 是纯 UI preference，不改变 projection。
- right panel selected tab 可以保留，但不能影响 projection。

## Deep Links

Stream 和 Swimlane 中的 item 应支持跳转：

- diff -> Files tab
- command output -> Terminal tab
- test result -> Tests tab
- artifact -> Report 或 Files tab
- preview health -> Preview tab
- gate decision log -> Stream filtered view 或 Report audit section

## Testing Contract

每个 renderer 必须有固定 fixture 测试：

- user requirement + normalized summary。
- Requirement Group 完整 P/A/O/R。
- Development Group 中 Coding Agent 产生 diff。
- QA Agent 产生 failed test。
- dangerous operation gate open。
- gate resolved。
- change request created/resolved。
- deployment URL submitted / rejected / completed。
- project paused/resumed with interrupted slice。
- final suite failed and returned to development。
- 切换模式 lossless。

优先测试 projection，再测试 renderer。
